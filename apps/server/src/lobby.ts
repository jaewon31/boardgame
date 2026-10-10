import { HoldemHand } from './holdem/hand.ts';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMessage, ErrorCode, GameId, LobbyRoom, ServerMessage } from '@boardgame/shared';

interface Member {
  id: string;
  nickname: string;
  token: string;
  stack: number;
  seat: number;
  socket?: WebSocket;
  expiry?: ReturnType<typeof setTimeout>;
}
interface Room {
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
}
interface LobbyOptions {
  nextHandMs?: number;
  runoutMs?: number;
  riverSqueezeMs?: number;
  turnMs?: number;
  reconnectMs?: number;
  heartbeatMs?: number;
  maxRooms?: number;
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const maxPlayers = 6;

function parseMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.type === 'ping' && Number.isSafeInteger(v.id) && Number(v.id) >= 0) return { type: 'ping', id: Number(v.id) };
  if (v.type === 'startHand' && (v.previousHandId === null || typeof v.previousHandId === 'string')) return { type: 'startHand', previousHandId: v.previousHandId };
  if (v.type === 'revealRiver' && typeof v.handId === 'string') return { type: 'revealRiver', handId: v.handId };
  if (v.type === 'revealCards' && typeof v.handId === 'string') return { type: 'revealCards', handId: v.handId };
  if (v.type === 'resetChips' && typeof v.handId === 'string') return { type: 'resetChips', handId: v.handId };
  if (v.type === 'act' && typeof v.handId === 'string' && Number.isSafeInteger(v.revision)
    && ['fold', 'check', 'call', 'raise', 'allIn'].includes(String(v.action))
    && (v.amount === undefined || Number.isSafeInteger(v.amount))) return v as unknown as ClientMessage;
  if (v.type === 'leave') return { type: 'leave' };
  if (v.type === 'resume' && typeof v.code === 'string' && /^[A-Z2-9]{8}$/.test(v.code)
    && typeof v.token === 'string' && /^[a-f0-9]{64}$/.test(v.token)) {
    return { type: 'resume', code: v.code, token: v.token };
  }
  if (typeof v.nickname !== 'string' || v.nickname.length > 48) return null;
  const nickname = v.nickname.trim().normalize('NFC');
  if ([...nickname].length < 1 || [...nickname].length > 12 || /[\p{Cc}\p{Cf}]/u.test(nickname)) return null;
  if (v.type === 'create' && (v.game === 'holdem' || v.game === 'seotda')) {
    return { type: 'create', nickname, game: v.game };
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
  const reconnectMs = options.reconnectMs ?? 30_000;
  const wss = new WebSocketServer({ server, path: '/lobby', maxPayload: 2048, perMessageDeflate: false });
  const alive = new WeakSet<WebSocket>();
  let stopping = false;

  function send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
  function snapshot(room: Room, viewer: string): LobbyRoom {
    return {
      ...(room.hand ? { holdem: room.hand.viewFor(viewer) } : {}),
      nextHandAt: room.nextHandAt ?? null, fundedPlayers: room.players.filter(p => p.stack > 0).length,
      code: room.code, game: room.game, hostId: room.hostId, maxPlayers,
      players: room.players.map(p => ({ id: p.id, nickname: p.nickname, connected: !!p.socket })),
    };
  }
  function broadcast(room: Room) {
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
    room.hand = new HoldemHand(players.map(p => ({ id: p.id, nickname: p.nickname, stack: p.stack })),
      { dealerIndex, number: ++room.handNumber, turnMs: options.turnMs, runoutMs: options.runoutMs, riverSqueezeMs: options.riverSqueezeMs });
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
  function syncGame(room: Room) {
    clearTimeout(room.turnTimer);
    room.hand?.skipDisconnectedSqueeze(room.players.filter(p => p.socket).map(p => p.id));
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
    scheduleNextHand(room);
    broadcast(room);
  }
  function remove(room: Room, member: Member) {
    room.hand?.depart(member.id);
    clearTimeout(member.expiry);
    room.players = room.players.filter(p => p !== member);
    if (room.players.length === 0) { clearTimeout(room.turnTimer); cancelNextHand(room); rooms.delete(room.code); return; }
    if (room.hostId === member.id) {
      room.hostId = (room.players.find(p => p.socket) ?? room.players[0]).id;
    }
    syncGame(room);
  }

  wss.on('connection', (socket, request) => {
    socket.on('error', () => socket.terminate());
    const ip = request.socket.remoteAddress ?? 'unknown';
    const count = connectionsByIp.get(ip) ?? 0;
    if (count >= 24) { socket.close(1013, 'Too many connections'); return; }
    connectionsByIp.set(ip, count + 1);
    alive.add(socket);
    let membership: { room: Room; member: Member } | undefined;
    let messages = 0;
    let windowStart = Date.now();
    const authTimeout = setTimeout(() => {
      if (!membership) socket.close(1008, 'Join timeout');
    }, 15_000);
    authTimeout.unref();
    const fail = (code: ErrorCode, message: string) => send(socket, { type: 'error', code, message, recoverable: !!membership && code !== 'RATE_LIMITED' });

    socket.on('pong', () => alive.add(socket));
    socket.on('message', (data, isBinary) => {
      if (stopping) return;
      if (membership && membership.member.socket !== socket) return;
      if (Date.now() - windowStart >= 10_000) { messages = 0; windowStart = Date.now(); }
      if (++messages > 30) {
        fail('RATE_LIMITED', '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
        socket.close(1008, 'Rate limit');
        return;
      }
      const input = isBinary ? null : parseMessage(data.toString());
      if (!input) { fail('INVALID_REQUEST', '닉네임(1~12자)과 8자리 초대 코드를 확인해 주세요.'); return; }
      if (input.type === 'ping') {
        if (!membership) { fail('SESSION_EXPIRED', '방에 다시 입장해 주세요.'); return; }
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
        send(socket, { type: 'left' });
        socket.close(1000, 'Left room');
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
              room.players.forEach(p => { p.stack = 1000; });
              room.hand = undefined;
            } else {
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
      let room: Room;
      let member: Member;
      if (input.type === 'resume') {
        const existing = rooms.get(input.code);
        const previous = existing?.players.find(p => p.token === input.token);
        if (!existing || !previous) { fail('SESSION_EXPIRED', '재접속 시간이 지났거나 방이 닫혔어요. 다시 입장해 주세요.'); return; }
        room = existing;
        member = previous;
        const oldSocket = member.socket;
        // Switch ownership before closing the old connection; its close must not evict the new one.
        member.socket = socket;
        clearTimeout(member.expiry);
        member.expiry = undefined;
        oldSocket?.close(4001, 'Session replaced');
      } else {
        if (input.type === 'create') {
          if (rooms.size >= (options.maxRooms ?? 1000)) { fail('SERVER_FULL', '서버가 혼잡해요. 잠시 후 다시 시도해 주세요.'); return; }
          let code: string;
          do { code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (rooms.has(code));
          room = { code, game: input.game, hostId: '', players: [], nextSeat: 0, dealerSeat: -1, handNumber: 0 };
          rooms.set(code, room);
        } else {
          const existing = rooms.get(input.code);
          if (!existing) { fail('ROOM_NOT_FOUND', '초대 코드를 확인해 주세요. 방이 없거나 닫혔어요.'); return; }
          room = existing;
        }
        if (room.hand && !room.hand.complete) { fail('GAME_ERROR', '진행 중인 판이 끝나면 입장해 주세요.'); return; }
        if (room.players.length >= maxPlayers) { fail('ROOM_FULL', '방이 가득 찼어요. 최대 6명까지 입장할 수 있어요.'); return; }
        if (room.players.some(p => p.nickname.toLowerCase() === input.nickname.toLowerCase())) {
          fail('NICKNAME_TAKEN', '이 방에서 사용 중인 닉네임이에요. 다른 이름을 입력해 주세요.'); return;
        }
        member = { id: randomUUID(), nickname: input.nickname, token: randomBytes(32).toString('hex'), stack: 1000, seat: room.nextSeat++, socket };
        room.players.push(member);
        if (!room.hostId) room.hostId = member.id;
      }
      membership = { room, member };
      clearTimeout(authTimeout);
      scheduleNextHand(room);
      send(socket, { type: 'joined', room: snapshot(room, member.id), playerId: member.id, token: member.token });
      broadcast(room);
    });
    socket.on('close', () => {
      clearTimeout(authTimeout);
      const remaining = (connectionsByIp.get(ip) ?? 1) - 1;
      if (remaining <= 0) connectionsByIp.delete(ip); else connectionsByIp.set(ip, remaining);
      if (!membership || membership.member.socket !== socket || stopping) return;
      const { room, member } = membership;
      member.socket = undefined;
      member.expiry = setTimeout(() => remove(room, member), reconnectMs);
      member.expiry.unref();
      syncGame(room);
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.has(socket)) { socket.terminate(); continue; }
      alive.delete(socket);
      socket.ping();
    }
  }, options.heartbeatMs ?? 15_000);
  heartbeat.unref();

  return {
    close() {
      stopping = true;
      clearInterval(heartbeat);
      for (const room of rooms.values()) { cancelNextHand(room); clearTimeout(room.turnTimer); for (const member of room.players) clearTimeout(member.expiry); }
      rooms.clear();
      for (const socket of wss.clients) socket.terminate();
      wss.close();
    },
  };
}
