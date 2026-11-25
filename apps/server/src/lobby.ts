import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { AccountResult } from './FriendStatsStore.ts';
import { saveReview, reviewFor } from './holdem/review.ts';
import type { SavedReview } from './holdem/review.ts';
import { DEFAULT_SETTINGS, validRoomSettings, safeCloseReason, logRecord } from '@boardgame/shared';
import type { RoomSettings, DailyResult, Card } from '@boardgame/shared';
import { clientIp } from './network.ts';
import { allowedOrigin } from './origins.ts';
import type { StateStore } from './stateStore.ts';
import { HoldemHand } from './holdem/hand.ts';
import { createGameTiming, elapsed, handRef, type GameTimingSink } from './gameTiming.ts';
import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Server, IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMessage, ErrorCode, GameId, LobbyRoom, RebuyNotice, SeatNotice, SeatRestoreNotice, ServerMessage } from '@boardgame/shared';
import { applyPendingRebuys, cancelRebuyRequest, dropMemberRebuys, grantHostRebuy, rebuyRequestView, requestRebuy, resolveRebuyRequest, restoreRebuys, revalidateRebuys, type RebuyGrant, type RebuyRequest } from './rebuy.ts';
import { rebuyLimit } from '@boardgame/shared';
import { createSeatEvents, type SeatEventSink } from './seatEvents.ts';
import { SEAT_COUNT, cancelSeatRequest, dropMemberRequests, freeSeat, releaseSeat, requestSeat, resolveSeatRequest, restoreSeats, seatRequestView, seatedMembers, standUp, takeSeat, type SeatRequest } from './seating.ts';

interface Member {
  accountId?: string;
  loginId?: string;
  id: string;
  nickname: string;
  token: string;
  /** Chip balance. Owned by the member, not the seat, so it survives seat changes (future stand-up/rebuy). */
  stack: number;
  /** Fixed table seat 0..maxPlayers-1; null = in the room but not seated (not dealt in). */
  seat: number | null;
  /** Held a seat in this room before; a later request is a re-seat ('resit'). */
  seatedBefore?: boolean;
  /** Last seat decision for this member only (rejection survives refresh). */
  seatNotice?: SeatNotice;
  /** Disconnected: the seat is held for this account until this server time (seatHoldMs, 3 min). */
  seatHeldUntil?: number;
  /** Seat is released when the current hand ends: stood up, or the hold expired mid-hand. */
  standPending?: 'voluntary' | 'expired';
  seatHold?: ReturnType<typeof setTimeout>;
  /** Approved rebuy chips held until this member's current hand settles (rebuy.ts). */
  pendingRebuy?: number;
  rebuyNotice?: RebuyNotice;
  /** Seat came back after a reconnect inside the hold; shown to this member until the next hand. */
  seatRestore?: SeatRestoreNotice;
  /** The server saw this member's transport close (not merely a slow reply): their turns are auto-played. */
  offlineConfirmed?: boolean;
  /** When the confirmed disconnect happened; turns are auto-played only after offlineGraceMs (2 s). */
  offlineAt?: number;
  socket?: WebSocket;
  expiresAt?: number;
  expiry?: ReturnType<typeof setTimeout>;
}
/**
 * Chip balance of an account that is no longer a member of the room (left, membership expired,
 * replaced by a new login). The server is the only writer. An entry is consumed once on rejoin
 * (no double restore) and ignored after a settings change or chip reset (settingsRevision).
 */
interface ChipLedgerEntry { playerId: string; stack: number; settingsRevision: number; savedAt: number; /** Approved rebuy not yet applied when the member left. */ extra?: number }
interface Room {
  seatRequests: SeatRequest[];
  /** accountId -> balance kept for a departed member of this room. */
  chipLedger: Record<string, ChipLedgerEntry>;
  rebuyRequests: RebuyRequest[];
  rebuyLog: RebuyGrant[];
  /** Hand whose result was copied to member stacks; later syncs of that finished hand leave stacks alone. */
  settledHandId?: string;
  recoveryTimer?: ReturnType<typeof setTimeout>;
  /** Wakes the room when a disconnected actor's 2-second grace ends. */
  offlineTimer?: ReturnType<typeof setTimeout>;
  rebuySeen: string[];
  /** Bumped only when stacks are reset (chip reset, settings change other than maxRebuy); kept balances must match it. */
  chipRevision: number;
  /**
   * Chip audit: chips that should exist in this room (members + pending grants + valid kept balances).
   * Changed only by legitimate chip events: a new member's starting chips, approved/host rebuy grants,
   * a chip reset. Checked once per settled hand. Undefined = baseline not known yet (older checkpoint).
   */
  chipExpected?: number;
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
    players: Array<{loginId?: string; accountId?: string; id: string; nickname: string; token: string; stack: number; seat: number | null; expiresAt?: number;
      seatedBefore?: boolean; seatNotice?: SeatNotice; seatHeldUntil?: number; standPending?: 'voluntary' | 'expired';
      pendingRebuy?: number; rebuyNotice?: RebuyNotice; seatRestore?: SeatRestoreNotice}>;
    /** 6 = fixed 0..5 seat layout with nullable seats. Absent = legacy auto-seat checkpoint. */
    seatLayout?: 6;
    seatRequests?: SeatRequest[];
    chipLedger?: Record<string, ChipLedgerEntry>;
    rebuyRequests?: RebuyRequest[];
    rebuyLog?: RebuyGrant[];
    rebuySeen?: string[];
    chipRevision?: number;
    chipExpected?: number;
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
  queueDepth?: number; receiveSequence?: number; eventLoopMaxMs?: number; eventLoopMeanMs?: number;
  pingId?: number; queueWaitMs?: number; authMs?: number; transportRttMs?: number; pongAgeMs?: number;
  code?: number; reason?: string; command?: string; previousConnectionId?: string;
  connections?: number; connectionsForIp?: number; durationMs?: number; ownsMembership?: boolean;
}
interface LobbyOptions {
  allowedOrigins?: readonly string[];
  diagnostic?: (entry: ConnectionDiagnostic) => void;
  /** Opt-in game progression timing sink (GAME_TIMING_LOG=1). Absent = disabled. */
  gameTiming?: GameTimingSink;
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
  /**
   * How long a disconnected player's seat is held for the same account (default 3 minutes,
   * never longer than the membership grace). After it, the seat is released once the current
   * hand ends; the member stays in the room as a spectator with the same chips.
   */
  seatHoldMs?: number;
  heartbeatMs?: number;
  /** Grace after a confirmed disconnect before the player's turns are auto-played (default 2000 ms). */
  offlineGraceMs?: number;
  /** Test hook: restart recovery window (default 30000 ms). */
  recoveryMs?: number;
  /** Seat/reconnect/rebuy/chip-audit diagnostics sink (SEAT_EVENT_LOG). Absent = disabled, no cost. */
  seatEvents?: SeatEventSink;
  maxRooms?: number;
  /**
   * Legacy behaviour: seat every joiner automatically in the lowest free seat.
   * Off by default (production): joiners stay unseated until the host approves a seat request.
   * Kept for regression tests that exercise game flow rather than seating.
   */
  autoSeat?: boolean;
  /** Test hook: deck source for each new hand (default: a fresh crypto shuffle per hand). */
  deck?: () => Card[];
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const maxPlayers = SEAT_COUNT;
// Room records use a consistent calendar day for this Korean-language app.
const today = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
function settingsCopy(s: RoomSettings): RoomSettings {
  return { startingChips:s.startingChips, smallBlind:s.smallBlind, bigBlind:s.bigBlind, turnSeconds:s.turnSeconds, ...(s.maxRebuy !== undefined ? { maxRebuy: s.maxRebuy } : {}) };
}

function restoreLedger(value: unknown): Record<string, ChipLedgerEntry> {
  const ledger: Record<string, ChipLedgerEntry> = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ledger;
  for (const [accountId, e] of Object.entries(value as Record<string, Partial<ChipLedgerEntry> | null>)) {
    if (!e || typeof e.playerId !== 'string' || !Number.isSafeInteger(e.stack) || e.stack! < 0
      || !Number.isSafeInteger(e.settingsRevision) || !Number.isFinite(e.savedAt)) continue;
    ledger[accountId] = { playerId: e.playerId, stack: e.stack!, settingsRevision: e.settingsRevision!, savedAt: e.savedAt!,
      ...(Number.isSafeInteger(e.extra) && e.extra! > 0 ? { extra: e.extra } : {}) };
  }
  return ledger;
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
  // Seat requests carry no chip amount: rebuy will be its own message and approval (policy C).
  if (v.type === 'requestSeat' && Number.isSafeInteger(v.seat) && Number(v.seat) >= 0 && Number(v.seat) < SEAT_COUNT && v.rebuyAmount === undefined) {
    return { type: 'requestSeat', seat: Number(v.seat) };
  }
  if (v.type === 'cancelSeatRequest') return { type: 'cancelSeatRequest' };
  if (v.type === 'standUp') return { type: 'standUp' };
  // The amount is only a request; rebuy.ts validates it (positive safe integer) and the host decides.
  if (v.type === 'requestRebuy' && typeof v.amount === 'number') {
    return { type: 'requestRebuy', amount: v.amount, ...(typeof v.clientRequestId === 'string' && v.clientRequestId.length <= 64 ? { clientRequestId: v.clientRequestId } : {}) };
  }
  if (v.type === 'cancelRebuyRequest') return { type: 'cancelRebuyRequest' };
  if (v.type === 'resolveRebuyRequest' && typeof v.requestId === 'string' && /^[a-f0-9-]{36}$/.test(v.requestId) && typeof v.approve === 'boolean') {
    return { type: 'resolveRebuyRequest', requestId: v.requestId, approve: v.approve };
  }
  if (v.type === 'resolveSeatRequest' && typeof v.requestId === 'string' && /^[a-f0-9-]{36}$/.test(v.requestId) && typeof v.approve === 'boolean') {
    return { type: 'resolveSeatRequest', requestId: v.requestId, approve: v.approve };
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
  // The seat hold cannot outlive the membership itself (RECONNECT_MS may be configured lower).
  const seatHoldMs = Math.min(options.seatHoldMs ?? 180_000, seatRetentionMs);
  const offlineGraceMs = Math.max(0, options.offlineGraceMs ?? 2_000);
  const seatLog = createSeatEvents(options.seatEvents);
  const wss = new WebSocketServer({ server, path: '/lobby', maxPayload: 12288, perMessageDeflate: false,
    verifyClient: (info: {req:IncomingMessage}) => allowedOrigin(info.req.headers.origin, options.allowedOrigins ?? []),
  });
  const alive = new WeakSet<WebSocket>();
  let stopping = false;
  const serverId = randomUUID();
  const loopDelay = monitorEventLoopDelay({resolution: 20});
  loopDelay.enable();
  const loopMetrics = setInterval(() => {
    try {
      (options.diagnostic ?? (entry => console.info(JSON.stringify(entry))))(logRecord({event: 'server_event_loop', serverId,
        eventLoopMaxMs: Math.round(loopDelay.max / 1e6),
        eventLoopMeanMs: Number.isFinite(loopDelay.mean) ? Math.round(loopDelay.mean / 1e6) : 0}));
    } catch { /* Metrics are observational only. */ }
    loopDelay.reset();
  }, 15000);
  loopMetrics.unref();
  const connections = new WeakMap<WebSocket, {connectionId: string; accountRef?: string; sessionRef?: string}>();
  const transportTiming = new WeakMap<WebSocket, {pingAt?: number; pongAt: number}>();
  const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16);
  // Game timing is observation only: every hook below is a no-op unless options.gameTiming is set,
  // and wrapped callbacks run exactly the original code in the same tick.
  const timing = createGameTiming(options.gameTiming);
  type TraceContext = { trace: string; cause: string; startedAt: number };
  let traceContext: TraceContext | undefined;
  let timerSequence = 0;
  const roomRefs = new WeakMap<Room, string>();
  const lastBroadcast = new WeakMap<Room, { handId?: string; street?: string; boardCount: number }>();
  // Room codes are short (~2^40), so a plain hash would be reversible from logs. A per-process
  // random HMAC key keeps refs correlatable within this process only; it is never logged or stored.
  const roomRefKey = timing.enabled ? randomBytes(32) : undefined;
  const roomRef = (room: Room) => {
    let ref = roomRefs.get(room);
    if (!ref) { ref = createHmac('sha256', roomRefKey!).update(room.code).digest('hex').slice(0, 16); roomRefs.set(room, ref); }
    return ref;
  };
  type TimerSlot = 'turn' | 'next';
  type PendingTimer = { trace: string; kind: string; scheduledAt: number; delayMs: number };
  const pendingTimers = new WeakMap<Room, Partial<Record<TimerSlot, PendingTimer>>>();
  /** Logs only: call right before an existing clearTimeout of a timed() timer. */
  function timerCleared(room: Room, slot: TimerSlot, reason: string) {
    if (!timing.enabled) return;
    const slots = pendingTimers.get(room), pending = slots?.[slot];
    if (!slots || !pending) return;
    delete slots[slot];
    timing.emit('game_timer_cancelled', { trace: pending.trace, kind: pending.kind, reason, roomRef: roomRef(room), handRef: handRef(room.hand?.id),
      delayMs: pending.delayMs, afterMs: elapsed(pending.scheduledAt, timing.now()) });
  }
  function withTrace<T>(context: TraceContext | undefined, run: () => T): T {
    if (!timing.enabled || !context) return run();
    const previous = traceContext; traceContext = context;
    try { return run(); } finally { traceContext = previous; }
  }
  function timerKind(room: Room) {
    const phase = room.hand?.timingSnapshot().runoutPhase;
    return phase === 'dealing' ? 'runout' : phase === 'squeezing' ? 'river_squeeze' : 'turn';
  }
  /** Returns `run` itself when timing is disabled. `kind` is evaluated only when enabled. */
  function timed(room: Room, slot: TimerSlot, kindOf: string | (() => string), delayMs: number, run: () => void): () => void {
    if (!timing.enabled) return run;
    const kind = typeof kindOf === 'function' ? kindOf() : kindOf;
    const trace = `timer.${++timerSequence}`, scheduledAt = timing.now();
    timerCleared(room, slot, 'replaced');
    const slots = pendingTimers.get(room) ?? {};
    slots[slot] = { trace, kind, scheduledAt, delayMs: Math.round(delayMs) };
    pendingTimers.set(room, slots);
    timing.emit('game_timer_scheduled', { trace, kind, roomRef: roomRef(room), handRef: handRef(room.hand?.id), street: room.hand?.timingSnapshot().street, delayMs: Math.round(delayMs) });
    return () => {
      const firedAt = timing.now();
      if (slots[slot]?.trace === trace) delete slots[slot];
      timing.emit('game_timer_fired', { trace, kind, roomRef: roomRef(room), handRef: handRef(room.hand?.id), delayMs: Math.round(delayMs), lateMs: elapsed(scheduledAt + delayMs, firedAt) });
      withTrace({ trace, cause: kind, startedAt: firedAt }, run);
    };
  }
  function observeBroadcast(room: Room, startedAt: number, persistedAt: number, recipients: number) {
    const finishedAt = timing.now(), context = traceContext, state = room.hand?.timingSnapshot();
    const previous = lastBroadcast.get(room), handId = room.hand?.id;
    const common = { trace: context?.trace, cause: context?.cause ?? 'other', roomRef: roomRef(room), handRef: handRef(handId),
      sinceTriggerMs: context ? elapsed(context.startedAt, finishedAt) : undefined };
    if (state && previous && previous.handId === handId && (previous.street !== state.street || previous.boardCount !== state.boardCount)) {
      timing.emit('game_street_changed', { ...common, fromStreet: previous.street, toStreet: state.street, fromBoard: previous.boardCount, toBoard: state.boardCount, revision: state.revision });
    }
    let maxBufferedBytes = 0;
    for (const member of room.players) if (member.socket) maxBufferedBytes = Math.max(maxBufferedBytes, member.socket.bufferedAmount);
    timing.emit('game_state_broadcast', { ...common, revision: state?.revision, street: state?.street, boardCount: state?.boardCount, complete: room.hand?.complete,
      runoutPhase: state?.runoutPhase, recipients, persistMs: elapsed(startedAt, persistedAt), sendMs: elapsed(persistedAt, finishedAt), maxBufferedBytes });
    lastBroadcast.set(room, { handId, street: state?.street, boardCount: state?.boardCount ?? 0 });
  }
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
      ...(room.hand ? { holdem: room.hand.viewFor(viewer, true) } : {}),
      handReviews: (room.reviews ?? []).map(r=>reviewFor(r,viewer)),
      nextHandAt: room.nextHandAt ?? null, fundedPlayers: room.players.filter(p => p.seat !== null && p.stack > 0).length,
      code: room.code, game: room.game, hostId: room.hostId, maxPlayers,
      settingsRevision: room.settingsRevision, settings: room.settings, todayResults: room.daily.date === today() ? room.daily : {date:today(), players:[]},
      players: room.players.map(p => ({ id: p.id, nickname: p.nickname, connected: !!p.socket, seat: p.seat, stack: p.stack,
        seatHeldUntil: !p.socket && p.seatHeldUntil !== undefined ? p.seatHeldUntil : null, standingUp: !!p.standPending, pendingChips: p.pendingRebuy ?? 0 })),
      // Everyone sees which seats are reserved and by whom (nickname/chips are public); only the host may decide.
      seatRequests: room.seatRequests.map(r => seatRequestView(room, r)),
      seatNotice: room.players.find(p => p.id === viewer)?.seatNotice ?? null,
      // Rebuy requests are visible to everyone (chips are public at the table); only the host decides.
      rebuyRequests: room.rebuyRequests.filter(r => r.playerId !== room.hostId || viewer === room.hostId).map(r => rebuyRequestView(room, r)),
      rebuyNotice: room.players.find(p => p.id === viewer)?.rebuyNotice ?? null,
      seatRestore: room.players.find(p => p.id === viewer)?.seatRestore ?? null,
    };
  }
  const seated = (room: Room) => seatedMembers(room.players);
  function broadcast(room: Room) {
    const startedAt = timing.enabled ? timing.now() : 0;
    if (!persist()) return;
    const persistedAt = timing.enabled ? timing.now() : 0;
    let recipients = 0;
    for (const member of room.players) if (member.socket) { send(member.socket, { type: 'room', room: snapshot(room, member.id) }); recipients++; }
    if (timing.enabled) observeBroadcast(room, startedAt, persistedAt, recipients);
  }
  function cancelNextHand(room: Room, reason = 'cancelled') {
    timerCleared(room, 'next', reason);
    clearTimeout(room.nextHandTimer);
    room.nextHandTimer = undefined;
    room.nextHandAt = undefined;
  }
  function startNextHand(room: Room): boolean {
    applyRebuys(room);
    // Only seated players are dealt in, in clockwise seat order. Seats approved mid-hand join here.
    const players = seated(room).filter(p => p.socket && p.stack > 0 && !p.standPending).sort((a, b) => a.seat! - b.seat!);
    if (players.length < 2) return false;
    cancelNextHand(room);
    let dealerIndex = players.findIndex(p => p.seat! > room.dealerSeat);
    if (dealerIndex < 0) dealerIndex = 0;
    room.startingStacks = Object.fromEntries(players.map(p => [p.id, p.stack]));
    room.handAccounts=Object.fromEntries(players.filter(p=>p.accountId).map(p=>[p.id,p.accountId!]));
    room.hand = new HoldemHand(players.map(p => ({ id: p.id, nickname: p.nickname, stack: p.stack })),
      { dealerIndex, number: ++room.handNumber, turnMs: options.turnMs ?? room.settings.turnSeconds * 1000, smallBlind: room.settings.smallBlind, bigBlind: room.settings.bigBlind, runoutMs: options.runoutMs, riverSqueezeMs: options.riverSqueezeMs, deck: options.deck?.() });
    room.dealerSeat = players[dealerIndex].seat!;
    for (const member of room.players) member.seatRestore = undefined;
    return true;
  }
  function scheduleNextHand(room: Room) {
    if (!room.hand?.complete || seated(room).filter(p => p.stack > 0).length < 2) {
      cancelNextHand(room);
      return;
    }
    // Reveals and duplicate broadcasts must not extend the result/reveal window.
    if (room.nextHandTimer) return;
    if (seated(room).filter(p => p.socket && p.stack > 0).length < 2) return;
    const handId = room.hand.id;
    room.nextHandAt ??= Date.now() + (options.nextHandMs ?? 5_000);
    const nextHandDelay = Math.max(1, room.nextHandAt - Date.now());
    room.nextHandTimer = setTimeout(timed(room, 'next', 'next_hand', nextHandDelay, () => {
      room.nextHandTimer = undefined;
      if (stopping || rooms.get(room.code) !== room || room.hand?.id !== handId || !room.hand.complete) return;
      startNextHand(room);
      syncGame(room);
    }), nextHandDelay);
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
    timerCleared(room, 'turn', 'resync');
    clearTimeout(room.turnTimer);
    clearTimeout(room.offlineTimer); room.offlineTimer = undefined;
    let settledNow: string | undefined;
    autoActOffline(room);
    scheduleOfflineGrace(room);
    if (!room.recoveryUntil || Date.now() >= room.recoveryUntil) room.hand?.skipDisconnectedSqueeze(room.players.filter(p => p.socket).map(p => p.id));
    if (room.hand) {
      // Copy hand stacks to members until the hand's result has been copied once. After that the
      // members own their balance again (a rebuy applied after the hand must not be overwritten).
      if (room.settledHandId !== room.hand.id) {
        for (const p of room.hand.players) {
          const member = room.players.find(m => m.id === p.id);
          if (member) { member.stack = p.stack; continue; }
          // A departed all-in player can still win: keep the kept balance exact (assignment, never added twice).
          const accountId = room.handAccounts?.[p.id], entry = accountId ? room.chipLedger[accountId] : undefined;
          if (entry && entry.playerId === p.id) entry.stack = p.stack;
        }
        if (room.hand.complete) { room.settledHandId = room.hand.id; settledNow = room.hand.id; }
      }
      if (!room.hand.complete && room.hand.deadline !== null) {
        const turnDelay = Math.max(1, room.hand.deadline - Date.now());
        room.turnTimer = setTimeout(timed(room, 'turn', () => timerKind(room), turnDelay, () => { room.hand!.timeout(); syncGame(room); }), turnDelay);
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
    settleStanding(room);
    applyRebuys(room);
    if (settledNow) auditChips(room, settledNow);
    scheduleNextHand(room);
    broadcast(room);
    // Memberships whose grace ran out while they were still in a hand leave now that it is over.
    for (const member of room.players.filter(m => !m.socket && m.expiresAt !== undefined && m.expiresAt <= Date.now() && !inCurrentHand(room, m))) remove(room, member);
  }
  /** Chips that exist in the room outside a running pot: members, their held grants, valid kept balances. */
  function roomChips(room: Room) {
    let total = 0;
    for (const m of room.players) total += m.stack + (m.pendingRebuy ?? 0);
    for (const e of Object.values(room.chipLedger)) if (e.settingsRevision === room.chipRevision) total += e.stack + (e.extra ?? 0);
    return total;
  }
  function expectChips(room: Room, delta: number) { if (room.chipExpected !== undefined) room.chipExpected += delta; }
  /** A legitimate reset of everyone's chips: the expected total starts again from what is there now. */
  function rebaseChips(room: Room, reason: string) {
    room.chipExpected = roomChips(room);
    seatLog.emit('chip_audit', room.code, { phase: 'baseline', reason, expected: room.chipExpected });
  }
  /** Once per settled hand: a surplus means chips were created (e.g. a grant applied twice), a shortfall means chips were lost. */
  function auditChips(room: Room, handId: string) {
    const actual = roomChips(room);
    if (room.chipExpected === undefined) { room.chipExpected = actual; seatLog.emit('chip_audit', room.code, { phase: 'baseline', reason: 'restored', expected: actual }); return; }
    const expected = room.chipExpected, delta = actual - expected;
    seatLog.emit('chip_audit', room.code, { phase: 'hand', handRef: handRef(handId), players: room.players.length, expected, actual, delta, ok: delta === 0,
      kind: delta > 0 ? 'excess' : delta < 0 ? 'missing' : undefined }, delta === 0 ? 'info' : 'error');
    if (delta !== 0) room.chipExpected = actual; // report once; later hands are measured from here
  }
  /** Held grants of members no longer in a running hand are added now (logged per member). */
  function applyRebuys(room: Room) {
    const held = room.players.filter(m => m.pendingRebuy).map(m => [m, m.pendingRebuy!] as const);
    if (!held.length) return;
    applyPendingRebuys(room, m => inCurrentHand(room, m as Member));
    for (const [m, amount] of held) if (!m.pendingRebuy) seatLog.emit('rebuy', room.code, { phase: 'applied', accountRef: seatLog.accountRef(m.accountId), amount });
  }
  /** Transport loss confirmed by the server (close/heartbeat), or still offline after restart recovery. */
  function confirmedOffline(room: Room, member: Member) {
    if (member.socket) return false;
    if (member.offlineConfirmed) return Date.now() - (member.offlineAt ?? 0) >= offlineGraceMs;
    return room.recoveryUntil !== undefined && Date.now() >= room.recoveryUntil;
  }
  /** The current actor dropped less than 2 s ago: come back when the grace ends (cancelled by any resync). */
  function scheduleOfflineGrace(room: Room) {
    const hand = room.hand, id = hand && !hand.complete ? hand.actorId : null;
    const member = id && hand!.legalFor(id) ? room.players.find(p => p.id === id) : undefined;
    if (!member || member.socket || !member.offlineConfirmed) return;
    const remaining = (member.offlineAt ?? 0) + offlineGraceMs - Date.now();
    if (remaining <= 0) return;
    room.offlineTimer = setTimeout(() => { room.offlineTimer = undefined; if (!stopping && rooms.get(room.code) === room) syncGame(room); }, remaining);
    room.offlineTimer.unref();
  }
  /**
   * A disconnected player's betting turn is played at once: check if allowed, otherwise fold.
   * Uses the normal action path, so pots, side pots, order and payouts follow the usual rules.
   * Each action needs the player to be the current actor, so a turn can never be played twice.
   */
  function autoActOffline(room: Room) {
    const hand = room.hand;
    for (let guard = 0; hand && !hand.complete && guard < 64; guard++) {
      const id = hand.actorId, legal = id ? hand.legalFor(id) : null;
      const member = id ? room.players.find(p => p.id === id) : undefined;
      if (!id || !legal || !member || !confirmedOffline(room, member)) return;
      const action = legal.canCheck ? 'check' : 'fold';
      hand.act(id, action);
      seatLog.emit('auto_action', room.code, { accountRef: seatLog.accountRef(member.accountId), handRef: handRef(hand.id), action,
        offlineMs: member.offlineAt !== undefined ? Date.now() - member.offlineAt : undefined, afterRestart: !member.offlineConfirmed });
    }
  }
  /** Socket gone: keep membership for the grace period and the seat for the hold. */
  function markOffline(room: Room, member: Member, confirmed: boolean) {
    member.socket = undefined;
    member.offlineConfirmed = confirmed || undefined;
    member.offlineAt = confirmed ? Date.now() : undefined;
    member.expiresAt = Date.now() + seatRetentionMs;
    scheduleExpiry(room, member);
    holdSeat(room, member);
  }
  /**
   * The same account signed in again (other device or browser) and is coming back to this room:
   * the membership moves to the new login. The old socket is closed and, because member.socket no
   * longer points at it, anything it still sends is dropped before it can touch the room.
   */
  function takeOver(room: Room, member: Member, loginId: string | undefined, next: WebSocket) {
    const old = member.socket;
    member.loginId = loginId;
    seatLog.emit('membership_takeover', room.code, { accountRef: seatLog.accountRef(member.accountId), previousConnected: !!old, seat: member.seat });
    if (!old) return;
    markOffline(room, member, false);
    replaceSocket(old, next, 4003, 'Account replaced');
  }
  /** Still dealt into an unfinished hand: the seat must stay until that hand settles. */
  function inCurrentHand(room: Room, member: Member) {
    return !!room.hand && !room.hand.complete && room.hand.players.some(p => p.id === member.id);
  }
  /** Release seats that were waiting for the hand to end. Chips stay with the member. */
  function settleStanding(room: Room) {
    for (const member of room.players) if (member.standPending && member.seat !== null && !inCurrentHand(room, member)) {
      const seat = member.seat, reason = member.standPending;
      releaseSeat(member);
      seatLog.emit('seat_released', room.code, { accountRef: seatLog.accountRef(member.accountId), seat, reason, stack: member.stack });
    }
  }
  function clearSeatHold(member: Member) { clearTimeout(member.seatHold); member.seatHold = undefined; }
  function expireSeatHold(member: Member) {
    member.seatHeldUntil = undefined;
    if (member.seat !== null && !member.standPending) member.standPending = 'expired';
  }
  function scheduleSeatHold(room: Room, member: Member) {
    clearSeatHold(member);
    if (member.seatHeldUntil === undefined) return;
    member.seatHold = setTimeout(() => {
      member.seatHold = undefined;
      if (stopping || member.socket || rooms.get(room.code) !== room || !room.players.includes(member) || member.seatHeldUntil === undefined) return;
      if (member.seatHeldUntil > Date.now()) { scheduleSeatHold(room, member); return; }
      expireSeatHold(member);
      seatLog.emit('seat_hold', room.code, { phase: 'expired', accountRef: seatLog.accountRef(member.accountId), seat: member.seat, inHand: inCurrentHand(room, member) });
      syncGame(room);
    }, Math.max(1, member.seatHeldUntil - Date.now()));
    member.seatHold.unref();
  }
  /** Transport lost: hold the seat for the same account (server clock). */
  function holdSeat(room: Room, member: Member) {
    if (member.seat === null || member.standPending) return;
    member.seatHeldUntil = Date.now() + seatHoldMs;
    scheduleSeatHold(room, member);
    seatLog.emit('seat_hold', room.code, { phase: 'started', accountRef: seatLog.accountRef(member.accountId), seat: member.seat, holdMs: seatHoldMs });
  }
  /** Same account back: inside the hold the seat returns without approval; after it, the release goes ahead. */
  function reclaimSeat(room: Room, member: Member) {
    clearSeatHold(member);
    if (member.seatHeldUntil === undefined) return;
    const within = member.seatHeldUntil > Date.now(), leftMs = member.seatHeldUntil - Date.now();
    if (within) {
      member.seatHeldUntil = undefined;
      if (member.seat !== null) member.seatRestore = { seat: member.seat, stack: member.stack, at: Date.now() };
    } else expireSeatHold(member);
    seatLog.emit('seat_hold', room.code, { phase: within ? 'reclaimed' : 'expired_on_return', accountRef: seatLog.accountRef(member.accountId), seat: member.seat, leftMs: Math.max(0, leftMs) });
    settleStanding(room);
  }
  /** One-time restore of a departed account's balance in this room. */
  function takeLedger(room: Room, accountId: string) {
    const entry = room.chipLedger[accountId];
    if (!entry) return undefined;
    delete room.chipLedger[accountId];
    if (entry.settingsRevision !== room.chipRevision) return undefined; // stale: not counted since the chip reset
    if (room.players.some(p => p.id === entry.playerId)) { expectChips(room, -(entry.stack + (entry.extra ?? 0))); return undefined; }
    return entry;
  }
  function scheduleExpiry(room: Room, member: Member) {
    clearTimeout(member.expiry);
    const remaining = (member.expiresAt ?? Infinity) - Date.now();
    member.expiry = setTimeout(() => {
      if (stopping || member.socket || rooms.get(room.code) !== room || !room.players.includes(member)) return;
      if ((member.expiresAt ?? Infinity) > Date.now()) { scheduleExpiry(room, member); return; }
      // Still in a running hand: leave once it is over (syncGame), never by folding mid-hand.
      if (inCurrentHand(room, member)) return;
      remove(room, member);
    }, Math.max(1, remaining));
    member.expiry.unref();
  }
  function remove(room: Room, member: Member) {
    if (rooms.get(room.code) !== room || !room.players.includes(member)) return;
    room.hand?.depart(member.id);
    const handPlayer = room.hand?.players.find(p => p.id === member.id);
    if (handPlayer && room.settledHandId !== room.hand!.id) member.stack = handPlayer.stack;
    // The balance outlives the membership: the same account rejoining this room gets it back once.
    if (member.accountId) room.chipLedger[member.accountId] = { playerId: member.id, stack: member.stack, settingsRevision: room.chipRevision, savedAt: Date.now(),
      ...(member.pendingRebuy ? { extra: member.pendingRebuy } : {}) };
    else expectChips(room, -(member.stack + (member.pendingRebuy ?? 0))); // no account, no kept balance: these chips leave the room
    dropMemberRebuys(room, member.id);
    recordResult(room);
    clearTimeout(member.expiry);
    clearSeatHold(member);
    room.players = room.players.filter(p => p !== member);
    dropMemberRequests(room, member.id);
    if (room.players.length === 0) { clearTimeout(room.recoveryTimer); clearTimeout(room.offlineTimer); timerCleared(room, 'turn', 'room_closed'); clearTimeout(room.turnTimer); cancelNextHand(room, 'room_closed'); rooms.delete(room.code); persist(); return; }
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
    let receiveSequence = 0;
    socket.on('message',(data,isBinary)=>{
      if(++queued>30){closeSocket(socket, 1008, 'Too many pending requests');return;}
      const receivedAt=Date.now(), sequence=++receiveSequence, receivedMono=timing.enabled?timing.now():0;
      diagnostic(socket, 'ws_message_enqueued', {receiveSequence: sequence, queueDepth: queued});
      requests=requests.then(()=>handle(data,isBinary,receivedAt,sequence,receivedMono)).catch(()=>closeSocket(socket, 1011, 'Request failed')).finally(()=>{queued--;});
    });
    async function handle(data:import('ws').RawData,isBinary:boolean,receivedAt:number,sequence:number,receivedMono=0) {
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

      diagnostic(socket, 'ws_request_started', {command: input.type, receiveSequence: sequence, queueDepth: queued, queueWaitMs: Date.now() - receivedAt,
        pingId: input.type === 'ping' ? input.id : undefined});
      if (input.type === 'ping') diagnostic(socket, 'ws_app_ping_received', {pingId: input.id, receiveSequence: sequence, queueWaitMs: Date.now() - receivedAt});
      const authStarted = Date.now();
      // Timing trace: connection ref + per-socket receive sequence (no payload, no identity).
      const traceId = timing.enabled ? `${connections.get(socket)?.connectionId.slice(0, 8) ?? 'conn'}.${sequence}` : '';
      const startedMono = timing.enabled ? timing.now() : 0;
      const gameCommand = input.type === 'startHand' || input.type === 'act' || input.type === 'resetChips' || input.type === 'revealCards' || input.type === 'revealRiver';
      const traced = timing.enabled && (gameCommand || input.type === 'ping');
      let authMono: number | undefined;
      if (traced && gameCommand) timing.emit('game_request_received', { trace: traceId, command: input.type, action: input.type === 'act' ? input.action : undefined,
        roomRef: membership ? roomRef(membership.room) : undefined, handRef: handRef(membership?.room.hand?.id),
        clientRevision: input.type === 'act' ? input.revision : undefined, serverRevision: membership?.room.hand?.revision, queueWaitMs: elapsed(receivedMono, startedMono) });
      const requestDone = (outcome: string) => { if (traced) timing.emit('game_request_done', { trace: traceId, command: input.type, outcome,
        queueWaitMs: elapsed(receivedMono, startedMono), authMs: authMono, handleMs: elapsed(startedMono, timing.now()), totalMs: elapsed(receivedMono, timing.now()) }); };
      let accountId:string|undefined,loginId:string|undefined;
      if(options.authorize) {
        let token:unknown;
        try { token=JSON.parse(data.toString()).accessToken; } catch { /* parser already validated */ }
        const authMonoStart = traced ? timing.now() : 0;
        if (traced) timing.emit('game_auth_started', { trace: traceId, command: input.type });
        try { const identity=await options.authorize(typeof token==='string'?token:'');accountId=typeof identity==='string'?identity:identity?.accountId;loginId=typeof identity==='string'?identity:identity?.sessionId; }
        catch { if (traced) { authMono = elapsed(authMonoStart, timing.now()); timing.emit('game_auth_finished', { trace: traceId, command: input.type, outcome: 'unavailable', authMs: authMono }); requestDone('auth_unavailable'); } diagnostic(socket, 'ws_auth_unavailable', {command: input.type, receiveSequence: sequence, pingId: input.type === 'ping' ? input.id : undefined, authMs: Date.now() - authStarted}); send(socket,{type:'error',code:'AUTH_UNAVAILABLE',message:'로그인 확인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',recoverable:!!membership});if(!membership)closeSocket(socket, 1013, 'Authentication unavailable');return; }
        if (traced) { authMono = elapsed(authMonoStart, timing.now()); timing.emit('game_auth_finished', { trace: traceId, command: input.type, outcome: accountId ? 'verified' : 'no_account', authMs: authMono }); }
        diagnostic(socket, 'ws_auth_completed', {command: input.type, receiveSequence: sequence, pingId: input.type === 'ping' ? input.id : undefined, authMs: Date.now() - authStarted});
        if(stopping || socket.readyState!==WebSocket.OPEN || (membership && membership.member.socket!==socket)) { requestDone('stale_socket'); return; }
        if(!accountId || (membership && (membership.member.accountId!==accountId || membership.member.loginId!==loginId))) {
          diagnostic(socket, 'ws_auth_rejected', {command: input.type});
          send(socket,{type:'error',code:'AUTH_REQUIRED',message:'다른 기기에서 로그인했거나 로그인이 만료됐어요. 다시 로그인해 주세요.',recoverable:false});
          if(membership){const {room,member}=membership;membership=undefined;member.socket=undefined;remove(room,member);}
          requestDone('auth_rejected'); closeSocket(socket, 4003, 'Account session expired');return;
        }
        const info = connections.get(socket)!;
        const accountRef = fingerprint(accountId), sessionRef = fingerprint(loginId!);
        if (info.accountRef !== accountRef || info.sessionRef !== sessionRef) {
          Object.assign(info, {accountRef, sessionRef});
          diagnostic(socket, 'ws_authenticated', {command: input.type});
        }
      }
      if (input.type === 'ping') {
        if (!membership) { requestDone('no_membership'); fail('SESSION_EXPIRED', '방에 다시 입장해 주세요.'); return; }
        diagnostic(socket, 'ws_app_pong_sent', {pingId: input.id, authMs: Date.now() - authStarted});
        send(socket, { type: 'pong', id: input.id });
        requestDone('pong');
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
        const previous = room.settings, stacks = room.players.map(p => p.stack), chipRevision = room.chipRevision;
        const requests = room.rebuyRequests, notices = room.players.map(p => p.rebuyNotice);
        // An older client sends no maxRebuy: keep the room's current limit.
        const next = settingsCopy({ ...input.settings, maxRebuy: input.settings.maxRebuy ?? previous.maxRebuy });
        // Changing only the rebuy limit keeps everyone's chips; any other save resets them as before.
        const limitOnly = next.maxRebuy !== previous.maxRebuy && (['startingChips', 'smallBlind', 'bigBlind', 'turnSeconds'] as const).every(k => next[k] === previous[k]);
        room.settingsRevision++;
        room.settings = next;
        const chipExpected = room.chipExpected;
        if (!limitOnly) { room.players.forEach(p => { p.stack = room.settings.startingChips; }); room.chipRevision++; room.chipExpected = roomChips(room); }
        revalidateRebuys(room, rebuyLimit(room.settings));
        if (!persist()) {
          room.settingsRevision--;
          room.settings = previous;
          room.chipRevision = chipRevision;
          room.chipExpected = chipExpected;
          room.rebuyRequests = requests;
          room.players.forEach((p, i) => { p.stack = stacks[i]; p.rebuyNotice = notices[i]; });
          return;
        }
        if (!limitOnly) seatLog.emit('chip_audit', room.code, { phase: 'baseline', reason: 'settings_reset', expected: room.chipExpected });
        for (const r of requests) if (!room.rebuyRequests.includes(r)) seatLog.emit('rebuy', room.code, { phase: 'dropped_limit', accountRef: seatLog.accountRef(room.players.find(p => p.id === r.playerId)?.accountId), amount: r.amount, limit: rebuyLimit(room.settings) });
        send(socket, { type: 'settingsUpdated', settings: room.settings, settingsRevision: room.settingsRevision, requestId: input.requestId });
        broadcast(room);
        return;
      }
      if (input.type === 'requestSeat' || input.type === 'cancelSeatRequest' || input.type === 'resolveSeatRequest' || input.type === 'standUp') {
        if (!membership || membership.member.socket !== socket) { fail('SESSION_EXPIRED', '먼저 방에 입장해 주세요.'); return; }
        const { room, member } = membership;
        // Seat decisions only: no chips move here (rebuy is a separate flow, see seating.ts).
        const seatBefore = member.seat;
        const result = input.type === 'standUp' ? standUp(member, inCurrentHand(room, member))
          : input.type === 'requestSeat' ? requestSeat(room, member, input.seat)
          : input.type === 'cancelSeatRequest' ? cancelSeatRequest(room, member)
          : resolveSeatRequest(room, member, input.requestId, input.approve);
        if (!result.ok) { if (result.changed) broadcast(room); fail(result.code, result.message); return; }
        if (input.type === 'standUp' && member.seat === null) seatLog.emit('seat_released', room.code, { accountRef: seatLog.accountRef(member.accountId), seat: seatBefore, reason: 'voluntary', stack: member.stack });
        scheduleNextHand(room);
        broadcast(room);
        return;
      }
      if (input.type === 'requestRebuy' || input.type === 'cancelRebuyRequest' || input.type === 'resolveRebuyRequest') {
        if (!membership || membership.member.socket !== socket) { fail('SESSION_EXPIRED', '먼저 방에 입장해 주세요.'); return; }
        const { room, member } = membership;
        // Chips move only here, on the host's approval, once; never through a seat decision.
        const inHand = (m: object) => inCurrentHand(room, m as Member);
        const limit = rebuyLimit(room.settings);
        const topGrant = room.rebuyLog[0], requestCount = room.rebuyRequests.length;
        const decided = input.type === 'resolveRebuyRequest' ? room.rebuyRequests.find(r => r.id === input.requestId) : undefined;
        const decidedFor = decided ? room.players.find(p => p.id === decided.playerId) : undefined;
        // The host's own rebuy needs no approval (same limit); everyone else queues for the host.
        const result = input.type === 'requestRebuy'
            ? (room.hostId === member.id ? grantHostRebuy(room, member, input.amount, limit, inHand, Date.now(), input.clientRequestId)
              : requestRebuy(room, member, input.amount, limit, Date.now(), input.clientRequestId))
          : input.type === 'cancelRebuyRequest' ? cancelRebuyRequest(room, member)
          : resolveRebuyRequest(room, member, input.requestId, input.approve, inHand, Date.now(), limit);
        // A grant is the only new entry at the head of rebuyLog: count it once in the chip audit.
        const granted = room.rebuyLog[0] !== topGrant ? room.rebuyLog[0] : undefined;
        if (granted) expectChips(room, granted.amount);
        if (seatLog.enabled) {
          const who = (m: Member | undefined) => seatLog.accountRef(m?.accountId);
          if (!result.ok) { if (decided) seatLog.emit('rebuy', room.code, { phase: 'rejected', reason: 'limit', accountRef: who(decidedFor), amount: decided.amount, limit }); }
          else if (input.type === 'requestRebuy' && granted) seatLog.emit('rebuy', room.code, { phase: 'host_granted', accountRef: who(member), amount: granted.amount, held: granted.appliedAt === undefined });
          else if (input.type === 'requestRebuy') seatLog.emit('rebuy', room.code, room.rebuyRequests.length > requestCount
            ? { phase: 'requested', accountRef: who(member), amount: input.amount } : { phase: 'duplicate_ignored', accountRef: who(member), amount: input.amount });
          else if (input.type === 'cancelRebuyRequest') seatLog.emit('rebuy', room.code, { phase: 'cancelled', accountRef: who(member) });
          else if (decided) seatLog.emit('rebuy', room.code, granted ? { phase: 'approved', accountRef: who(decidedFor), amount: granted.amount, held: granted.appliedAt === undefined }
            : { phase: 'rejected', reason: 'host', accountRef: who(decidedFor), amount: decided.amount });
        }
        if (!result.ok) { if (result.changed) broadcast(room); fail(result.code, result.message); return; }
        scheduleNextHand(room);
        broadcast(room);
        return;
      }
      if (input.type === 'startHand' || input.type === 'act' || input.type === 'resetChips' || input.type === 'revealCards' || input.type === 'revealRiver') {
        try {
          if (!membership || membership.member.socket !== socket) throw new Error('먼저 방에 입장해 주세요.');
          const { room, member } = membership;
          const before = traced ? room.hand?.timingSnapshot() : undefined, applyStarted = traced ? timing.now() : 0;
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
              room.chipRevision++;
              room.hand = undefined;
              rebaseChips(room, 'chip_reset');
              room.settingsRevision++; // Drafts from a previous lobby are stale.
            } else {
              if (input.expectedSettingsRevision !== undefined && input.expectedSettingsRevision !== room.settingsRevision) throw new Error('방 설정이 바뀌었어요. 최신 설정을 확인하고 다시 시작해 주세요.');
              if ((room.hand?.id ?? null) !== input.previousHandId) throw new Error('게임 상태가 바뀌었어요.');
              if (room.hand) throw new Error('다음 판은 자동으로 시작됩니다.');
              if (!startNextHand(room)) throw new Error('자리에 앉아 접속 중이며 칩이 있는 친구가 2명 이상 필요해요.');
            }
          }
          if (traced) {
            const after = room.hand?.timingSnapshot();
            timing.emit('game_action_applied', { trace: traceId, command: input.type, action: input.type === 'act' ? input.action : undefined, roomRef: roomRef(room), handRef: handRef(room.hand?.id),
              revisionBefore: before?.revision, revisionAfter: after?.revision, streetBefore: before?.street, streetAfter: after?.street,
              boardBefore: before?.boardCount, boardAfter: after?.boardCount, runoutPhase: after?.runoutPhase, applyMs: elapsed(applyStarted, timing.now()) });
          }
          withTrace(traced ? { trace: traceId, cause: input.type === 'act' ? 'action' : input.type, startedAt: receivedMono } : undefined, () => syncGame(room));
          requestDone('applied');
        } catch (error) { requestDone('rejected'); fail('GAME_ERROR', error instanceof Error ? error.message : '게임 요청에 실패했어요.'); }
        return;
      }
      if (membership) { fail('ALREADY_JOINED', '현재 방에서 먼저 나가 주세요.'); return; }
      // A newly verified login of the same account that comes back to its room (another device or
      // browser) takes the membership over: seat and chips stay, the previous login loses control at
      // once. Entering a different room still retires the previous membership immediately.
      let takenOver: { room: Room; member: Member } | undefined;
      if(accountId)for(const previousRoom of [...rooms.values()])for(const previous of [...previousRoom.players]) {
        if(previous.accountId!==accountId || previous.loginId===loginId) continue;
        const returning = input.type === 'currentRoom' || (input.type === 'join' && input.code === previousRoom.code)
          || (input.type === 'resume' && input.code === previousRoom.code && input.token === previous.token);
        if (returning) { takeOver(previousRoom, previous, loginId, socket); takenOver = { room: previousRoom, member: previous }; continue; }
        const old=previous.socket;previous.socket=undefined;remove(previousRoom,previous);replaceSocket(old, socket, 4003, 'Account replaced');
      }
      const restoreMembership = (existing: Room, previous: Member) => {
        const old = previous.socket;
        previous.socket = socket;
        previous.offlineConfirmed = undefined; previous.offlineAt = undefined;
        clearTimeout(previous.expiry); previous.expiry = undefined; previous.expiresAt = undefined;
        membership = { room: existing, member: previous };
        clearTimeout(authTimeout);
        diagnostic(socket, 'ws_membership', {command: input.type});
        replaceSocket(old, socket, 4001, 'Session replaced');
        reclaimSeat(existing, previous);
        scheduleNextHand(existing);
        if (!persist()) return;
        send(socket, { type: 'joined', room: snapshot(existing, previous.id), playerId: previous.id, token: previous.token });
        broadcast(existing);
      };
      // Invite link opened on the new device for the room this account is already in.
      if (takenOver && input.type === 'join') { restoreMembership(takenOver.room, takenOver.member); return; }
      // Resolve membership from the verified account/session, never a supplied user ID.
      if (input.type === 'currentRoom') {
        if (!accountId) { fail('AUTH_REQUIRED', '로그인이 필요해요.'); return; }
        for (const existing of rooms.values()) {
          const previous = existing.players.find(p => p.accountId === accountId && p.loginId === loginId);
          if (!previous) continue;
          if (previous.expiresAt !== undefined && previous.expiresAt <= Date.now() && !inCurrentHand(existing, previous)) { remove(existing, previous); continue; }
          restoreMembership(existing, previous);
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
        member.offlineConfirmed = undefined; member.offlineAt = undefined;
        replaceSocket(oldSocket, socket, 4001, 'Session replaced');
        reclaimSeat(room, member);
      } else {
        if (input.type === 'create') {
          if (input.game !== 'holdem') { fail('GAME_ERROR', '현재는 홀덤만 이용할 수 있어요.'); return; }
          if (rooms.size >= (options.maxRooms ?? 1000)) { fail('SERVER_FULL', '서버가 혼잡해요. 잠시 후 다시 시도해 주세요.'); return; }
          let code: string;
          do { code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (rooms.has(code));
          room = { code, game: input.game, hostId: '', players: [], seatRequests: [], chipLedger: Object.create(null), rebuyRequests: [], rebuyLog: [], rebuySeen: [], chipRevision: 0, chipExpected: 0, nextSeat: 0, dealerSeat: -1, handNumber: 0, settingsRevision: 0, settings: settingsCopy(input.settings ?? DEFAULT_SETTINGS), daily: {date:today(), players:[]} };
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
        // Everyone, the host included, joins unseated and picks one of the six seats. The host's own
        // pick is immediate; other players need the host's approval. Legacy autoSeat seats on join.
        const seat = options.autoSeat ? freeSeat(room) : null;
        // Same account coming back to this room: its kept balance (and player id) return once, unseated.
        const kept = accountId ? takeLedger(room, accountId) : undefined;
        member = { accountId, loginId, id: kept?.playerId ?? randomUUID(), nickname: input.nickname, token: randomBytes(32).toString('hex'),
          stack: kept?.stack ?? room.settings.startingChips, seat: null, ...(kept ? { seatedBefore: true } : {}), ...(kept?.extra ? { pendingRebuy: kept.extra } : {}), socket };
        if (seat !== null) takeSeat(room, member, seat);
        room.players.push(member);
        if (!room.hostId) room.hostId = member.id;
        if (!kept) expectChips(room, member.stack); // a kept balance only moves from the ledger back to the member
        applyRebuys(room);
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
      markOffline(room, member, true);
      const closedAt = timing.enabled ? timing.now() : 0;
      if (timing.enabled) timing.emit('game_player_disconnected', { trace: `close.${connections.get(socket)?.connectionId.slice(0, 8) ?? 'conn'}`, roomRef: roomRef(room), handRef: handRef(room.hand?.id),
        street: room.hand?.timingSnapshot().street, isActor: !!room.hand && room.hand.actorId === member.id });
      withTrace(timing.enabled ? { trace: `close.${connections.get(socket)?.connectionId.slice(0, 8) ?? 'conn'}`, cause: 'disconnect', startedAt: closedAt } : undefined, () => syncGame(room));
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
      seatLayout: 6 as const, seatRequests: room.seatRequests, chipLedger: room.chipLedger, rebuyRequests: room.rebuyRequests, rebuyLog: room.rebuyLog, rebuySeen: room.rebuySeen, chipRevision: room.chipRevision, chipExpected: room.chipExpected,
      players: room.players.map(p => ({loginId:p.loginId, accountId:p.accountId, id:p.id, nickname:p.nickname, token:p.token, stack:p.stack, seat:p.seat, expiresAt:p.expiresAt,
        seatedBefore:p.seatedBefore, seatNotice:p.seatNotice, seatHeldUntil:p.seatHeldUntil, standPending:p.standPending,
        pendingRebuy:p.pendingRebuy, rebuyNotice:p.rebuyNotice, seatRestore:p.seatRestore})),
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
    clearInterval(loopMetrics); loopDelay.disable();
    for (const room of rooms.values()) {
      cancelNextHand(room, 'shutdown'); timerCleared(room, 'turn', 'shutdown'); clearTimeout(room.turnTimer); clearTimeout(room.recoveryTimer); clearTimeout(room.offlineTimer);
      for (const member of room.players) { clearTimeout(member.expiry); clearSeatHold(member); }
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
          players:r.players.map(p => ({...p})), seatRequests: [], chipLedger: restoreLedger(r.chipLedger), rebuyRequests: [], rebuyLog: [], rebuySeen: [],
          // Older checkpoints kept balances against settingsRevision; that value is the starting chip revision.
          chipRevision: Number.isSafeInteger(r.chipRevision) ? r.chipRevision! : r.settingsRevision ?? 0,
          // Older checkpoints have no audit baseline: it is set at the first settled hand after restart.
          chipExpected: Number.isSafeInteger(r.chipExpected) ? r.chipExpected : undefined,
          hand:r.hand ? HoldemHand.restore(r.hand) : undefined, recoveryUntil:now+(options.recoveryMs ?? 30_000) };
        room.dealerSeat = restoreSeats(room, r, room.dealerSeat);
        restoreRebuys(room, r);
        // Member stacks in the checkpoint already contain a finished hand's result (and any rebuy after it).
        if (room.hand?.complete) room.settledHandId = room.hand.id;
        // Grace timers are not carried over a restart: everyone is offline, and the 30-second recovery
        // window (longer than the 2-second grace) decides when unreturned players are auto-played.
        for (const member of room.players) { member.offlineConfirmed = undefined; member.offlineAt = undefined; member.socket = undefined; }
        rooms.set(room.code, room);
        room.hand?.recoverClock(now);
        for (const member of room.players) {
          member.expiresAt ??= saved.savedAt + seatRetentionMs; // Restart must not renew an offline seat.
          scheduleExpiry(room, member);
          // Nobody is connected after a restart: the 3-minute seat hold counts from the last save, never renewed.
          if (member.seat !== null && !member.standPending) { member.seatHeldUntil ??= saved.savedAt + seatHoldMs; scheduleSeatHold(room, member); }
        }
        settleStanding(room);
        // After the recovery window, players who did not come back count as disconnected (their turns auto-play).
        room.recoveryTimer = setTimeout(() => { room.recoveryTimer = undefined; if (!stopping && rooms.get(room.code) === room) syncGame(room); }, options.recoveryMs ?? 30_000);
        room.recoveryTimer.unref();
        if (room.hand && !room.hand.complete) {
          const restoredDelay = Math.max(1, (room.hand.deadline ?? now + 30_000) - now);
          room.turnTimer = setTimeout(timed(room, 'turn', () => `restored_${timerKind(room)}`, restoredDelay, () => { room.hand!.timeout(); syncGame(room); }), restoredDelay);
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
