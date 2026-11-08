import type { AccountResult } from './FriendStatsStore.ts';
import { saveReview, reviewFor } from './holdem/review.ts';
import type { SavedReview } from './holdem/review.ts';
import { DEFAULT_SETTINGS, validRoomSettings, safeCloseReason, logRecord } from '@boardgame/shared';
import type { RoomSettings, DailyResult } from '@boardgame/shared';
import { clientIp } from './network.ts';
import type { StateStore } from './stateStore.ts';
import { HoldemHand } from './holdem/hand.ts';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMessage, ErrorCode, GameId, LobbyRoom, ServerMessage } from '@boardgame/shared';

interface Member {
  accountId?: string;
  loginId?: string;
  id: string;
  nickname: string;
  token: string;
  stack: number;
  seat: number;
  socket?: WebSocket;
  expiresAt?: number;
  expiry?: ReturnType<typeof setTimeout>;
}
interface Room {
  reviews?: SavedReview[];
  settingsRevision: number;
  settings: RoomSettings;
  daily: { date: string; players: DailyResult[] };
  scoredHandId?: string;
  startingStacks?: Record<string, number>;
  handAccounts?: Record<string,string>;

  code: string;
  game: GameId;
  hostId: string;
  players: Member[];
  hand?: HoldemHand;
  turnTimer?: ReturnType<typeof setTimeout>;
  nextHandTimer?: ReturnType<typeof setTimeout>;
  nextHandAt?: number;
  nextSeat: number;
  dealerSeat: number;
  handNumber: number;
  recoveryUntil?: number;
}
export interface LobbyCheckpoint {
  version: 1;
  savedAt: number;
  rooms: Array<{
    code: string; game: GameId; hostId: string; nextSeat: number; dealerSeat: number; handNumber: number;
    players: Array<{loginId?: string; accountId?: string; id: string; nickname: string; token: string; stack: number; seat: number; expiresAt?: number}>;
    reviews?: SavedReview[];
    settingsRevision?: number;
    settings?: RoomSettings;
    daily?: { date: string; players: DailyResult[] };
    scoredHandId?: string;
    startingStacks?: Record<string, number>;
    handAccounts?: Record<string,string>;
    hand?: ReturnType<HoldemHand['checkpoint']>;
  }>;
}
export interface ConnectionDiagnostic {
  event: string; serverId: string; connectionId?: string; accountRef?: string; sessionRef?: string;
  pingId?: number; queueWaitMs?: number; authMs?: number; transportRttMs?: number; pongAgeMs?: number;
  code?: number; reason?: string; command?: string; previousConnectionId?: string;
  connections?: number; connectionsForIp?: number; durationMs?: number; ownsMembership?: boolean;
}
interface LobbyOptions {
  diagnostic?: (entry: ConnectionDiagnostic) => void;
  recordHand?: (id:string,players:AccountResult[])=>void;
  authorize?: (token:string)=>Promise<string|{accountId:string;sessionId:string}|null>;
  store?: StateStore;
  trustedProxies?: string[];
  maxConnections?: number;
  maxConnectionsPerIp?: number;
  onFatal?: () => void;
  nextHandMs?: number;
  runoutMs?: number;
  riverSqueezeMs?: number;
  turnMs?: number;
  /** Seat/account membership grace after transport loss, not room TTL. */
  seatRetentionMs?: number;
  reconnectMs?: number; // Backward-compatible RECONNECT_MS option.
  heartbeatMs?: number;
  maxRooms?: number;
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const maxPlayers = 6;
// Room records use a consistent calendar day for this Korean-language app.
const today = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
function settingsCopy(s: RoomSettings): RoomSettings {
  return { startingChips:s.startingChips, smallBlind:s.smallBlind, bigBlind:s.bigBlind, turnSeconds:s.turnSeconds };
}

function parseMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.type === 'ping' && Number.isSafeInteger(v.id) && Number(v.id) >= 0) return { type: 'ping', id: Number(v.id) };
  if (v.type === 'startHand' && (v.previousHandId === null || typeof v.previousHandId === 'string')) return { type: 'startHand', previousHandId: v.previousHandId, expectedSettingsRevision: Number.isSafeInteger(v.expectedSettingsRevision) ? Number(v.expectedSettingsRevision) : undefined };
  if (v.type === 'revealRiver' && typeof v.handId === 'string') return { type: 'revealRiver', handId: v.handId };
  if (v.type === 'revealCards' && typeof v.handId === 'string') return { type: 'revealCards', handId: v.handId };
  if (v.type === 'resetChips' && typeof v.handId === 'string') return { type: 'resetChips', handId: v.handId };
  if (v.type === 'act' && typeof v.handId === 'string' && Number.isSafeInteger(v.revision)
    && ['fold', 'check', 'call', 'raise', 'allIn'].includes(String(v.action))
    && (v.amount === undefined || Number.isSafeInteger(v.amount))) return v as unknown as ClientMessage;
  if (v.type === 'updateSettings' && validRoomSettings(v.settings)) {
    if (v.expectedRevision !== undefined && (!Number.isSafeInteger(v.expectedRevision) || Number(v.expectedRevision) < 0)) return null;
    if (v.requestId !== undefined && (typeof v.requestId !== 'string' || v.requestId.length > 80)) return null;
    return { type: 'updateSettings', settings: settingsCopy(v.settings), expectedRevision: v.expectedRevision as number | undefined, requestId: v.requestId as string | undefined };
  }
  if (v.type === 'currentRoom') return { type: 'currentRoom', previousCode: typeof v.previousCode === 'string' && /^[A-Z2-9]{8}$/.test(v.previousCode) ? v.previousCode : undefined };
  if (v.type === 'leave') return { type: 'leave' };
  if (v.type === 'resume' && typeof v.code === 'string' && /^[A-Z2-9]{8}$/.test(v.code)
    && typeof v.token === 'string' && /^[a-f0-9]{64}$/.test(v.token)) {
    return { type: 'resume', code: v.code, token: v.token };
  }
  if (typeof v.nickname !== 'string' || v.nickname.length > 48) return null;
  const nickname = v.nickname.trim().normalize('NFC');
  if ([...nickname].length < 1 || [...nickname].length > 12 || /[\p{Cc}\p{Cf}]/u.test(nickname)) return null;
  if (v.type === 'create' && (v.game === 'holdem' || v.game === 'seotda')) {
    if (v.settings !== undefined && !validRoomSettings(v.settings)) return null;
    return { type: 'create', nickname, game: v.game, settings: settingsCopy(v.settings ?? DEFAULT_SETTINGS) };
  }
  if (v.type === 'join' && typeof v.code === 'string' && v.code.length <= 16) {
    const code = v.code.trim().toUpperCase();
    if (/^[A-Z2-9]{8}$/.test(code)) return { type: 'join', code, nickname };
  }
  return null;
}

export function attachLobby(server: Server, options: LobbyOptions = {}) {
  const rooms = new Map<string, Room>();
  const connectionsByIp = new Map<string, number>();
  const seatRetentionMs = options.seatRetentionMs ?? options.reconnectMs ?? 300_000;
  const wss = new WebSocketServer({ server, path: '/lobby', maxPayload: 12288, perMessageDeflate: false });
  const alive = new WeakSet<WebSocket>();
  let stopping = false;
  const serverId = randomUUID();
  const connections = new WeakMap<WebSocket, {connectionId: string; accountRef?: string; sessionRef?: string}>();
  const transportTiming = new WeakMap<WebSocket, {pingAt?: number; pongAt: number}>();
  const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16);
  function diagnostic(socket: WebSocket, event: string, detail: Partial<ConnectionDiagnostic> = {}) {
    // Only fixed events, numeric metadata and hashed identities; never payloads or tokens.
    try { (options.diagnostic ?? (entry => console.info(JSON.stringify(entry))))(logRecord({
      event, serverId, ...connections.get(socket), ...detail,
    })); } catch { /* Diagnostics must never change connection lifecycle. */ }
  }
  function closeSocket(socket: WebSocket, code: number, reason: string) {
    diagnostic(socket, 'ws_close_requested', {code, reason: safeCloseReason(reason)});
    socket.close(code, reason);
  }
  function terminateSocket(socket: WebSocket, reason: string) {
    diagnostic(socket, 'ws_terminate', {reason}); socket.terminate();
  }
  function replaceSocket(old: WebSocket | undefined, next: WebSocket, code: number, reason: string) {
    if (!old) return;
    diagnostic(next, 'ws_replaced', {code, reason, previousConnectionId: connections.get(old)?.connectionId});
    closeSocket(old, code, reason);
  }

  function send(socket: WebSocket, message: ServerMessage) {
    if (socket.bufferedAmount > 256 * 1024) { terminateSocket(socket, 'backpressure'); return; }
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
  function snapshot(room: Room, viewer: string): LobbyRoom {
    return {
      ...(room.hand ? { holdem: room.hand.viewFor(viewer) } : {}),
      handReviews: (room.reviews ?? []).map(r=>reviewFor(r,viewer)),
      nextHandAt: room.nextHandAt ?? null, fundedPlayers: room.players.filter(p => p.stack > 0).length,
      code: room.code, game: room.game, hostId: room.hostId, maxPlayers,
      settingsRevision: room.settingsRevision, settings: room.settings, todayResults: room.daily.date === today() ? room.daily : {date:today(), players:[]},
      players: room.players.map(p => ({ id: p.id, nickname: p.nickname, connected: !!p.socket })),
    };
  }
  function broadcast(room: Room) {
    if (!persist()) return;
    for (const member of room.players) if (member.socket) send(member.socket, { type: 'room', room: snapshot(room, member.id) });
  }
  function cancelNextHand(room: Room) {
    clearTimeout(room.nextHandTimer);
    room.nextHandTimer = undefined;
    room.nextHandAt = undefined;
  }
  function startNextHand(room: Room): boolean {
    const players = room.players.filter(p => p.socket && p.stack > 0);
    if (players.length < 2) return false;
    cancelNextHand(room);
    let dealerIndex = players.findIndex(p => p.seat > room.dealerSeat);
    if (dealerIndex < 0) dealerIndex = 0;
    room.startingStacks = Object.fromEntries(players.map(p => [p.id, p.stack]));
    room.handAccounts=Object.fromEntries(players.filter(p=>p.accountId).map(p=>[p.id,p.accountId!]));
    room.hand = new HoldemHand(players.map(p => ({ id: p.id, nickname: p.nickname, stack: p.stack })),
      { dealerIndex, number: ++room.handNumber, turnMs: options.turnMs ?? room.settings.turnSeconds * 1000, smallBlind: room.settings.smallBlind, bigBlind: room.settings.bigBlind, runoutMs: options.runoutMs, riverSqueezeMs: options.riverSqueezeMs });
    room.dealerSeat = players[dealerIndex].seat;
    return true;
  }
  function scheduleNextHand(room: Room) {
    if (!room.hand?.complete || room.players.filter(p => p.socket && p.stack > 0).length < 2) {
      cancelNextHand(room);
      return;
    }
    // Reveals and duplicate broadcasts must not extend the result/reveal window.
    if (room.nextHandTimer) return;
    const handId = room.hand.id;
    room.nextHandAt = Date.now() + (options.nextHandMs ?? 10_000);
    room.nextHandTimer = setTimeout(() => {
      cancelNextHand(room);
      if (stopping || rooms.get(room.code) !== room || room.hand?.id !== handId || !room.hand.complete) return;
      startNextHand(room);
      syncGame(room);
    }, Math.max(1, room.nextHandAt - Date.now()));
    room.nextHandTimer.unref();
  }
  function recordResult(room: Room) {
    const hand = room.hand;
    if (!hand?.complete || room.scoredHandId === hand.id) return;
    const results:AccountResult[]=hand.players.flatMap(p=>{
      const accountId=room.handAccounts?.[p.id],starting=room.startingStacks?.[p.id];
      return accountId && starting!==undefined?[{accountId,netChips:p.stack-starting,won:hand.viewFor('').payouts.some(win=>win.playerId===p.id&&win.amount>0)}]:[];
    });
    try{options.recordHand?.(hand.id,results);}catch{stop();console.error(JSON.stringify(logRecord({event:'stats_persistence_failed'}, 'error')));options.onFatal?.();return;}
    room.scoredHandId = hand.id;
    if (room.daily.date !== today()) room.daily = { date:today(), players:[] };
    const payouts = hand.viewFor('').payouts;
    for (const p of hand.players) {
      const starting = room.startingStacks?.[p.id];
      if (starting === undefined) continue; // Legacy checkpoints have no trustworthy hand baseline.
      let row = room.daily.players.find(r => r.playerId === p.id);
      if (!row) {
        row = { playerId:p.id, nickname:p.nickname, hands:0, wins:0, netChips:0 };
        room.daily.players.push(row);
      }
      row.hands++; row.netChips += p.stack - starting;
      if (payouts.some(win => win.playerId === p.id && win.amount > 0)) row.wins++;
    }
  }
  function syncGame(room: Room) {
    clearTimeout(room.turnTimer);
    if (!room.recoveryUntil || Date.now() >= room.recoveryUntil) room.hand?.skipDisconnectedSqueeze(room.players.filter(p => p.socket).map(p => p.id));
    if (room.hand) {
      for (const p of room.hand.players) {
        const member = room.players.find(m => m.id === p.id);
        if (member) member.stack = p.stack;
      }
      if (!room.hand.complete && room.hand.deadline !== null) {
        room.turnTimer = setTimeout(() => { room.hand!.timeout(); syncGame(room); }, Math.max(1, room.hand.deadline - Date.now()));
        room.turnTimer.unref();
      }
    }
    if(room.hand?.complete) {
      room.reviews ??= [];
      const saved = saveReview(room.hand);
      const existing = room.reviews.findIndex(r=>r.public.hand.id===room.hand!.id);
      if(existing>=0) room.reviews[existing]=saved;
      else room.reviews.unshift(saved);
      room.reviews = room.reviews.slice(0,10);
    }
    recordResult(room);
    scheduleNextHand(room);
    broadcast(room);
  }
  function scheduleExpiry(room: Room, member: Member) {
    clearTimeout(member.expiry);
    const remaining = (member.expiresAt ?? Infinity) - Date.now();
    member.expiry = setTimeout(() => {
      if (stopping || member.socket || rooms.get(room.code) !== room || !room.players.includes(member)) return;
      if ((member.expiresAt ?? Infinity) > Date.now()) { scheduleExpiry(room, member); return; }
      remove(room, member);
    }, Math.max(1, remaining));
    member.expiry.unref();
  }
  function remove(room: Room, member: Member) {
    if (rooms.get(room.code) !== room || !room.players.includes(member)) return;
    room.hand?.depart(member.id);
    recordResult(room);
    clearTimeout(member.expiry);
    room.players = room.players.filter(p => p !== member);
    if (room.players.length === 0) { clearTimeout(room.turnTimer); cancelNextHand(room); rooms.delete(room.code); persist(); return; }
    if (room.hostId === member.id) {
      room.hostId = (room.players.find(p => p.socket) ?? room.players[0]).id;
    }
    syncGame(room);
  }

  wss.on('connection', (socket, request) => {
    const openedAt = Date.now();
    connections.set(socket, {connectionId: randomUUID()});
    transportTiming.set(socket, {pongAt: openedAt});
    diagnostic(socket, 'ws_open', {connections: wss.clients.size});
    // Register before admission checks so rejected connections also have close diagnostics.
    socket.on('close', (code, reason) => diagnostic(socket, 'ws_close', {
      code, reason: safeCloseReason(reason.toString()), durationMs: Date.now() - openedAt,
      connections: wss.clients.size,
    }));
    socket.on('error', () => terminateSocket(socket, 'socket_error'));
    send(socket, {type: 'connection', serverId, connectionId: connections.get(socket)!.connectionId});
    if (stopping || wss.clients.size > (options.maxConnections ?? 240)) { closeSocket(socket, 1013, 'Server busy'); return; }
    const ip = clientIp(request.socket.remoteAddress, request.headers['x-forwarded-for'], options.trustedProxies ?? []);
    const count = connectionsByIp.get(ip) ?? 0;
    if (count >= (options.maxConnectionsPerIp ?? 24)) { closeSocket(socket, 1013, 'Too many connections'); return; }
    connectionsByIp.set(ip, count + 1);
    diagnostic(socket, 'ws_admitted', {connectionsForIp: count + 1});
    alive.add(socket);
    let membership: { room: Room; member: Member } | undefined;
    let messages = 0;
    let windowStart = Date.now();
    const authTimeout = setTimeout(() => {
      if (!membership) closeSocket(socket, 1008, 'Join timeout');
    }, 15_000);
    authTimeout.unref();
    const fail = (code: ErrorCode, message: string, requestId?: string) => {
      diagnostic(socket, 'ws_request_rejected', {reason: code});
      send(socket, { type: 'error', code, message, requestId, recoverable: !!membership && code !== 'RATE_LIMITED' });
    };

    socket.on('pong', () => {
      alive.add(socket);
      const timing = transportTiming.get(socket)!;
      diagnostic(socket, 'ws_transport_pong', {transportRttMs: timing.pingAt === undefined ? undefined : Date.now() - timing.pingAt});
      timing.pongAt = Date.now();
    });
    let queued=0;let requests=Promise.resolve();
    socket.on('message',(data,isBinary)=>{
      if(++queued>30){closeSocket(socket, 1008, 'Too many pending requests');return;}
      const receivedAt=Date.now();
      requests=requests.then(()=>handle(data,isBinary,receivedAt)).catch(()=>closeSocket(socket, 1011, 'Request failed')).finally(()=>{queued--;});
    });
    async function handle(data:import('ws').RawData,isBinary:boolean,receivedAt:number) {
      if (stopping || socket.readyState!==WebSocket.OPEN) return;
      if (membership && membership.member.socket !== socket) return;
      if (Date.now() - windowStart >= 10_000) { messages = 0; windowStart = Date.now(); }
      if (++messages > 30) {
        fail('RATE_LIMITED', '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
        closeSocket(socket, 1008, 'Rate limit');
        return;
      }
      const input = isBinary ? null : parseMessage(data.toString());
      if (!input) { fail('INVALID_REQUEST', '닉네임·초대 코드 또는 방 설정의 허용 범위를 확인해 주세요.'); return; }

      if (input.type === 'ping') diagnostic(socket, 'ws_app_ping_received', {pingId: input.id, queueWaitMs: Date.now() - receivedAt});
      const authStarted = Date.now();
      let accountId:string|undefined,loginId:string|undefined;
      if(options.authorize) {
        let token:unknown;
        try { token=JSON.parse(data.toString()).accessToken; } catch { /* parser already validated */ }
        try { const identity=await options.authorize(typeof token==='string'?token:'');accountId=typeof identity==='string'?identity:identity?.accountId;loginId=typeof identity==='string'?identity:identity?.sessionId; }
        catch { diagnostic(socket, 'ws_auth_unavailable', {command: input.type, authMs: Date.now() - authStarted}); send(socket,{type:'error',code:'AUTH_UNAVAILABLE',message:'로그인 확인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',recoverable:!!membership});if(!membership)closeSocket(socket, 1013, 'Authentication unavailable');return; }
        if(stopping || socket.readyState!==WebSocket.OPEN || (membership && membership.member.socket!==socket)) return;
        if(!accountId || (membership && (membership.member.accountId!==accountId || membership.member.loginId!==loginId))) {
          diagnostic(socket, 'ws_auth_rejected', {command: input.type});
          send(socket,{type:'error',code:'AUTH_REQUIRED',message:'다른 기기에서 로그인했거나 로그인이 만료됐어요. 다시 로그인해 주세요.',recoverable:false});
          if(membership){const {room,member}=membership;membership=undefined;member.socket=undefined;remove(room,member);}
          closeSocket(socket, 4003, 'Account session expired');return;
        }
        const info = connections.get(socket)!;
        const accountRef = fingerprint(accountId), sessionRef = fingerprint(loginId!);
        if (info.accountRef !== accountRef || info.sessionRef !== sessionRef) {
          Object.assign(info, {accountRef, sessionRef});
          diagnostic(socket, 'ws_authenticated', {command: input.type});
        }
      }
      if (input.type === 'ping') {
        if (!membership) { fail('SESSION_EXPIRED', '방에 다시 입장해 주세요.'); return; }
        diagnostic(socket, 'ws_app_pong_sent', {pingId: input.id, authMs: Date.now() - authStarted});
        send(socket, { type: 'pong', id: input.id });
        return;
      }
      if (input.type === 'leave') {
        if (membership) {
          const { room, member } = membership;
          membership = undefined;
          member.socket = undefined;
          remove(room, member);
        }
        if (!persist()) return;
        send(socket, { type: 'left' });
        closeSocket(socket, 1000, 'Left room');
        return;
      }
      if (input.type === 'updateSettings') {
        if (!membership || membership.room.hostId !== membership.member.id) { fail('GAME_ERROR', '방장만 방 설정을 바꿀 수 있어요.', input.requestId); return; }
        const room = membership.room;
        if (room.hand) { fail('GAME_ERROR', '새 경기 준비 후 대기실에서 설정을 바꿔 주세요.', input.requestId); return; }
        if (input.expectedRevision !== room.settingsRevision) { fail('GAME_ERROR', '설정 버전이 바뀌었어요. 최신 앱에서 편집기를 다시 열고 확인해 주세요.', input.requestId); return; }
        const previous = room.settings, stacks = room.players.map(p => p.stack);
        room.settingsRevision++;
        room.settings = settingsCopy(input.settings);
        room.players.forEach(p => { p.stack = room.settings.startingChips; });
        if (!persist()) {
          room.settingsRevision--;
          room.settings = previous;
          room.players.forEach((p, i) => { p.stack = stacks[i]; });
          return;
        }
        send(socket, { type: 'settingsUpdated', settings: room.settings, settingsRevision: room.settingsRevision, requestId: input.requestId });
        broadcast(room);
        return;
      }
      if (input.type === 'startHand' || input.type === 'act' || input.type === 'resetChips' || input.type === 'revealCards' || input.type === 'revealRiver') {
        try {
          if (!membership || membership.member.socket !== socket) throw new Error('먼저 방에 입장해 주세요.');
          const { room, member } = membership;
          if (room.game !== 'holdem') throw new Error('홀덤 방에서만 시작할 수 있어요.');
          if (input.type === 'revealRiver') {
            if (!room.hand || room.hand.id !== input.handId) throw new Error('이미 지난 판의 리버입니다.');
            room.hand.revealRiver(member.id);
          } else if (input.type === 'revealCards') {
            if (!room.hand || room.hand.id !== input.handId) throw new Error('이미 끝난 판의 패는 공개할 수 없어요.');
            room.hand.revealCards(member.id);
          } else if (input.type === 'act') {
            if (!room.hand || room.hand.id !== input.handId || room.hand.revision !== input.revision) throw new Error('게임 상태가 바뀌었어요. 현재 차례를 확인해 주세요.');
            room.hand.act(member.id, input.action, input.amount);
          } else {
            if (room.hostId !== member.id) throw new Error('방장만 시작하거나 칩을 초기화할 수 있어요.');
            if (room.hand && !room.hand.complete) throw new Error('현재 판이 끝난 후 진행해 주세요.');
            if (input.type === 'resetChips') {
              if (!room.hand || room.hand.id !== input.handId) throw new Error('이미 초기화되었어요.');
              room.players.forEach(p => { p.stack = room.settings.startingChips; });
              room.hand = undefined;
              room.settingsRevision++; // Drafts from a previous lobby are stale.
            } else {
              if (input.expectedSettingsRevision !== undefined && input.expectedSettingsRevision !== room.settingsRevision) throw new Error('방 설정이 바뀌었어요. 최신 설정을 확인하고 다시 시작해 주세요.');
              if ((room.hand?.id ?? null) !== input.previousHandId) throw new Error('게임 상태가 바뀌었어요.');
              if (room.hand) throw new Error('다음 판은 자동으로 시작됩니다.');
              if (!startNextHand(room)) throw new Error('접속 중이며 칩이 있는 친구가 2명 이상 필요해요.');
            }
          }
          syncGame(room);
        } catch (error) { fail('GAME_ERROR', error instanceof Error ? error.message : '게임 요청에 실패했어요.'); }
        return;
      }
      if (membership) { fail('ALREADY_JOINED', '현재 방에서 먼저 나가 주세요.'); return; }
      // A newly verified login retires the prior login's seats immediately.
      if(accountId)for(const previousRoom of [...rooms.values()])for(const previous of [...previousRoom.players]) {
        if(previous.accountId===accountId && previous.loginId!==loginId){const old=previous.socket;previous.socket=undefined;remove(previousRoom,previous);replaceSocket(old, socket, 4003, 'Account replaced');}
      }
      // Resolve membership from the verified account/session, never a supplied user ID.
      if (input.type === 'currentRoom') {
        if (!accountId) { fail('AUTH_REQUIRED', '로그인이 필요해요.'); return; }
        for (const existing of rooms.values()) {
          const previous = existing.players.find(p => p.accountId === accountId && p.loginId === loginId);
          if (!previous) continue;
          if (previous.expiresAt !== undefined && previous.expiresAt <= Date.now()) { remove(existing, previous); continue; }
          const old = previous.socket;
          previous.socket = socket;
          clearTimeout(previous.expiry); previous.expiry = undefined; previous.expiresAt = undefined;
          membership = { room: existing, member: previous };
          clearTimeout(authTimeout);
          diagnostic(socket, 'ws_membership', {command: input.type});
          replaceSocket(old, socket, 4001, 'Session replaced');
          scheduleNextHand(existing);
          if (!persist()) return;
          send(socket, { type: 'joined', room: snapshot(existing, previous.id), playerId: previous.id, token: previous.token });
          broadcast(existing);
          return;
        }
        diagnostic(socket, 'ws_no_room');
        send(socket, { type: 'noRoom', ...(input.previousCode ? { reason: rooms.has(input.previousCode) ? 'membership-ended' as const : 'room-closed' as const } : {}) });
        return;
      }
      if(accountId && input.type!=='resume' && [...rooms.values()].some(r=>r.players.some(p=>p.accountId===accountId))) {
        fail('ALREADY_JOINED','이 계정은 이미 방에 참여 중이에요. 기존 방으로 다시 접속하거나 먼저 나가 주세요.');return;
      }
      let room: Room;
      let member: Member;
      if (input.type === 'resume') {
        const existing = rooms.get(input.code);
        const previous = existing?.players.find(p => p.token === input.token && (p.expiresAt === undefined || p.expiresAt > Date.now()));
        if (!existing || !previous || (options.authorize && previous.accountId!==accountId)) { fail('SESSION_EXPIRED', '재접속 시간이 지났거나 방이 닫혔어요. 다시 입장해 주세요.'); return; }
        room = existing;
        member = previous;
        const oldSocket = member.socket;
        // Switch ownership before closing the old connection; its close must not evict the new one.
        member.socket = socket;
        clearTimeout(member.expiry);
        member.expiry = undefined;
        member.expiresAt = undefined;
        replaceSocket(oldSocket, socket, 4001, 'Session replaced');
      } else {
        if (input.type === 'create') {
          if (input.game !== 'holdem') { fail('GAME_ERROR', '현재는 홀덤만 이용할 수 있어요.'); return; }
          if (rooms.size >= (options.maxRooms ?? 1000)) { fail('SERVER_FULL', '서버가 혼잡해요. 잠시 후 다시 시도해 주세요.'); return; }
          let code: string;
          do { code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (rooms.has(code));
          room = { code, game: input.game, hostId: '', players: [], nextSeat: 0, dealerSeat: -1, handNumber: 0, settingsRevision: 0, settings: settingsCopy(input.settings ?? DEFAULT_SETTINGS), daily: {date:today(), players:[]} };
          rooms.set(code, room);
        } else {
          const existing = rooms.get(input.code);
          if (!existing) { fail('ROOM_NOT_FOUND', '초대 코드를 확인해 주세요. 방이 없거나 닫혔어요.'); return; }
          room = existing;
        }
        if (room.players.length >= maxPlayers) { fail('ROOM_FULL', '방이 가득 찼어요. 최대 6명까지 입장할 수 있어요.'); return; }
        if (room.players.some(p => p.nickname.toLowerCase() === input.nickname.toLowerCase())) {
          fail('NICKNAME_TAKEN', '이 방에서 사용 중인 닉네임이에요. 다른 이름을 입력해 주세요.'); return;
        }
        member = { accountId, loginId, id: randomUUID(), nickname: input.nickname, token: randomBytes(32).toString('hex'), stack: room.settings.startingChips, seat: room.nextSeat++, socket };
        room.players.push(member);
        if (!room.hostId) room.hostId = member.id;
      }
      membership = { room, member };
      diagnostic(socket, 'ws_membership', {command: input.type});
      clearTimeout(authTimeout);
      scheduleNextHand(room);
      if (!persist()) return;
      send(socket, { type: 'joined', room: snapshot(room, member.id), playerId: member.id, token: member.token });
      broadcast(room);
    }
    socket.on('close', () => {
      diagnostic(socket, 'ws_cleanup', {ownsMembership: membership?.member.socket === socket});
      clearTimeout(authTimeout);
      const remaining = (connectionsByIp.get(ip) ?? 1) - 1;
      if (remaining <= 0) connectionsByIp.delete(ip); else connectionsByIp.set(ip, remaining);
      if (!membership || membership.member.socket !== socket || stopping) return;
      const { room, member } = membership;
      member.socket = undefined;
      member.expiresAt = Date.now() + seatRetentionMs;
      scheduleExpiry(room, member);
      syncGame(room);
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.has(socket)) { diagnostic(socket, 'ws_transport_timeout', {pongAgeMs: Date.now() - transportTiming.get(socket)!.pongAt}); terminateSocket(socket, 'heartbeat_timeout'); continue; }
      alive.delete(socket);
      transportTiming.get(socket)!.pingAt = Date.now();
      diagnostic(socket, 'ws_transport_ping');
      socket.ping();
    }
  }, options.heartbeatMs ?? 15_000);
  heartbeat.unref();

  function checkpoint(): LobbyCheckpoint {
    return { version: 1, savedAt: Date.now(), rooms: [...rooms.values()].map(room => ({
      code: room.code, game: room.game, hostId: room.hostId, nextSeat: room.nextSeat,
      dealerSeat: room.dealerSeat, handNumber: room.handNumber,
      reviews: room.reviews, settingsRevision: room.settingsRevision, settings: room.settings, daily: room.daily, scoredHandId: room.scoredHandId, startingStacks: room.startingStacks, handAccounts:room.handAccounts,
      players: room.players.map(p => ({loginId:p.loginId, accountId:p.accountId, id:p.id, nickname:p.nickname, token:p.token, stack:p.stack, seat:p.seat, expiresAt:p.expiresAt})),
      hand: room.hand?.checkpoint(),
    })) };
  }
  function persist() {
    if (stopping) return false;
    if (!options.store) return true;
    try { options.store.save(checkpoint()); return true; }
    catch {
      // Never acknowledge state that cannot be made durable.
      stop();
      console.error(JSON.stringify(logRecord({ event: 'persistence_failed' }, 'error')));
      options.onFatal?.();
      return false;
    }
  }
  function stop() {
    if (stopping) return;
    stopping = true;
    clearInterval(heartbeat);
    for (const room of rooms.values()) {
      cancelNextHand(room); clearTimeout(room.turnTimer);
      for (const member of room.players) clearTimeout(member.expiry);
    }
    for (const socket of wss.clients) terminateSocket(socket, 'server_shutdown');
    wss.close();
  }
  try {
    const saved = options.store?.load();
    if (saved) {
      if (saved.version !== 1 || !Number.isFinite(saved.savedAt) || !Array.isArray(saved.rooms)) throw new Error('Unsupported lobby checkpoint');
      const now = Date.now();
      // Abandoned rooms are not resurrected indefinitely after a long outage.
      if (now - saved.savedAt < 24 * 60 * 60 * 1000) for (const r of saved.rooms) {
        if (!/^[A-Z2-9]{8}$/.test(r.code) || r.game !== 'holdem' || !Array.isArray(r.players)) throw new Error('Invalid room checkpoint');
        const room: Room = { code:r.code, game:r.game, hostId:r.hostId, nextSeat:r.nextSeat, dealerSeat:r.dealerSeat, handNumber:r.handNumber,
          settingsRevision: r.settingsRevision ?? 0,
          settings: settingsCopy(r.settings && validRoomSettings(r.settings) ? r.settings : DEFAULT_SETTINGS),
          reviews:r.reviews ?? [], daily:r.daily ?? {date:today(), players:[]}, scoredHandId:r.scoredHandId, startingStacks:r.startingStacks, handAccounts:r.handAccounts,
          players:r.players.map(p => ({...p})), hand:r.hand ? HoldemHand.restore(r.hand) : undefined, recoveryUntil:now+30_000 };
        rooms.set(room.code, room);
        room.hand?.recoverClock(now);
        for (const member of room.players) {
          member.expiresAt ??= saved.savedAt + seatRetentionMs; // Restart must not renew an offline seat.
          scheduleExpiry(room, member);
        }
        if (room.hand && !room.hand.complete) {
          room.turnTimer = setTimeout(() => { room.hand!.timeout(); syncGame(room); }, Math.max(1, (room.hand.deadline ?? now + 30_000) - now));
          room.turnTimer.unref();
        }
      }
      if (!persist()) throw new Error('Checkpoint could not be persisted');
    }
  } catch (error) { stop(); throw error; }
  return {
    healthy: () => !stopping,
    stats: () => ({ rooms: rooms.size, connections: wss.clients.size }),
    close() { if (!stopping) persist(); stop(); },
  };
}
