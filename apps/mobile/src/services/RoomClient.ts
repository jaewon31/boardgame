import { safeCloseReason, logRecord, validConnectionId, transportFailure } from '@boardgame/shared';
import type { RoomSettings, ClientMessage, PokerAction, EntryRequest, LobbyRoom, ServerMessage } from '@boardgame/shared';

export interface RoomState {
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
  room: LobbyRoom | null;
  playerId: string | null;
  error: string | null;
  notice?: 'room-closed' | 'membership-ended';
}
export const emptyState: RoomState = { status: 'idle', room: null, playerId: null, error: null };

// Keep networking separate from React so reconnect and cancellation can be tested.
export interface ConnectionTiming { heartbeatMs?: number; heartbeatTimeoutMs?: number; retryMs?: number; retryWindowMs?: number; commandTimeoutMs?: number }
export interface SavedSession { code: string; token: string }
export interface SessionStore { load(): Promise<SavedSession | null>; save(session: SavedSession | null): Promise<void> }
export interface ClientConnectionDiagnostic {
  event: string; clientId: number; generation: number; code?: number; reason?: string;
  failureCategory?: string; serverId?: string; connectionId?: string; pingId?: number; queueWaitMs?: number; tokenWaitMs?: number;
  pongAgeMs?: number; pingQueuedAgeMs?: number; pingSentAgeMs?: number; readyState?: number;
  stale?: boolean; wasClean?: boolean; request?: string; delayMs?: number; accountRef?: string;
}
let nextClientId = 0;
export class RoomClient {
  readonly diagnosticId = ++nextClientId;
  private replaced = false;
  private contexts = new WeakMap<WebSocket, {generation: number; serverId?: string; connectionId?: string}>();
  private diagnostic(event: string, detail: Partial<ClientConnectionDiagnostic> = {}) {
    try { this.logger(logRecord({event, clientId: this.diagnosticId, generation: this.generation, ...(this.socket ? this.contexts.get(this.socket) : {}), ...detail})); }
    catch { /* Logging must not affect reconnect or cleanup. */ }
  }
  private logger: (entry: ClientConnectionDiagnostic) => void;
  private storage?: SessionStore;
  private disposed = false;
  private commandSequence = 0;
  private currentRoomRequest(): Extract<ClientMessage, {type: 'currentRoom'}> {
    return { type: 'currentRoom', previousCode: this.state.room?.code ?? this.session?.code };
  }
  clearNotice() { this.update({ notice: undefined }); }
  private leaving = false;
  private leaveTimer: ReturnType<typeof setTimeout> | undefined;
  private settingsPending: { requestId: string; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
  private finishSettings(error?: string) {
    const pending = this.settingsPending;
    this.settingsPending = undefined;
    if (!pending) return;
    clearTimeout(pending.timer);
    if (error) pending.reject(new Error(error)); else pending.resolve();
  }
  cancel() { this.disconnect('cancel'); this.update({ status: 'error', error: '방 확인을 취소했어요. 참여 상태를 다시 확인해 주세요.' }); }
  refresh(automatic = false) {
    if (this.disposed || (automatic && this.replaced)) return;
    // Only an explicit user retry may reclaim a connection replaced elsewhere.
    this.replaced = false;
    if (this.state.status === 'idle' || this.state.status === 'disconnected' || this.state.status === 'error') {
      this.retryUntil = 0;
      this.update({ status: 'connecting', error: null });
      if (this.accessToken) this.connect(this.currentRoomRequest());
      else if (this.session) this.connect({ type: 'resume', ...this.session });
      else this.update({ status: 'idle' });
    } else this.checkConnection();
  }
  accessToken?: ()=>Promise<string>;
  private sendQueue:Promise<void>=Promise.resolve();
  private send(socket:WebSocket,command:ClientMessage):Promise<void> {
    const generation = this.generation, queuedAt = Date.now();
    const transmit = (accessToken?: string, tokenWaitMs = 0, queueWaitMs = 0) => {
      if (generation !== this.generation || socket.readyState !== WebSocket.OPEN) return;
      if (command.type === 'ping') this.pingSentAt = Date.now();
      socket.send(JSON.stringify(accessToken === undefined ? command : {...command, accessToken}));
      if (command.type === 'ping') this.diagnostic('client_ping_sent', {pingId: command.id, tokenWaitMs, queueWaitMs});
      else this.diagnostic('client_request_sent', {request: command.type, tokenWaitMs, queueWaitMs});
    };
    if (!this.accessToken) { transmit(); return Promise.resolve(); }
    this.sendQueue = this.sendQueue.then(async () => {
      if (generation !== this.generation) return;
      const started = Date.now();
      const accessToken = await this.accessToken!();
      transmit(accessToken, Date.now() - started, started - queuedAt);
    }).catch(() => {
      if (generation === this.generation) {
        this.diagnostic('client_auth_unavailable'); this.connectionLost('auth_or_send_failed');
        this.update({error:'로그인 연결을 확인하지 못했어요. 연결 복구 후 다시 확인합니다.'});
      }
    });
    return this.sendQueue;
  }
  private writes: Promise<void> = Promise.resolve();
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private lastPong = 0;
  private pendingPing: number | null = null;
  private pingQueuedAt: number | null = null;
  private pingSentAt: number | null = null;
  private pingSequence = 0;
  private timing: Required<ConnectionTiming>;
  private socket: WebSocket | null = null;
  private generation = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private session: { code: string; token: string } | null = null;
  private retryUntil = 0;
  private state: RoomState = emptyState;
  private endpoint: string;
  private notify: (state: RoomState) => void;

  constructor(endpoint: string, notify: (state: RoomState) => void, timing: ConnectionTiming = {}, storage?: SessionStore, logger: (entry: ClientConnectionDiagnostic) => void = entry => console.info(JSON.stringify(entry))) {
    this.logger = logger;
    this.storage = storage;
    this.timing = { heartbeatMs: timing.heartbeatMs ?? 5000, heartbeatTimeoutMs: timing.heartbeatTimeoutMs ?? 15000, retryMs: timing.retryMs ?? 1000, retryWindowMs: timing.retryWindowMs ?? 300_000, commandTimeoutMs: timing.commandTimeoutMs ?? 8000 };
    this.endpoint = endpoint;
    this.notify = notify;
  }

  private remember(session: SavedSession | null) {
    this.session = session;
    if (!this.storage) return;
    const generation = this.generation;
    this.writes = this.writes.then(() => this.storage!.save(session)).catch(() => {
      if (generation === this.generation) this.update({ error: '기기에 재접속 정보를 저장하지 못했어요. 서버에서 참여 상태를 다시 확인할 수 있어요.' });
    });
  }
  async restore() {
    if (this.disposed || this.state.status !== 'idle') return;
    if (this.accessToken) { this.refresh(); return; }
    if (!this.storage) return;
    this.update({ status: 'connecting' });
    const generation = this.generation;
    try {
      const saved = await this.storage.load();
      if (generation !== this.generation) return;
      if (!saved) { this.update({ status: 'idle' }); return; }
      this.session = saved;
      this.connect({ type: 'resume', ...saved });
    } catch {
      if (generation === this.generation) this.update({ status:'error', error:'저장된 자리를 복구하지 못했어요. 초대 코드로 입장해 주세요.' });
    }
  }
  private update(patch: Partial<RoomState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.notify(this.state);
  }
  private disconnect(reason = 'reset') {
    if (this.socket) this.diagnostic('client_cleanup', {reason});
    this.generation++;
    this.sendQueue = Promise.resolve();
    this.leaving = false;
    clearTimeout(this.leaveTimer);
    this.finishSettings('연결이 끊겨 설정 저장을 확인하지 못했어요. 다시 연결한 뒤 확인해 주세요.');
    clearInterval(this.heartbeat);
    this.pendingPing = null;
    this.pingQueuedAt = null; this.pingSentAt = null;
    clearTimeout(this.retryTimer);
    clearTimeout(this.timeout);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  enter(request: EntryRequest) {
    if (this.disposed || (this.state.status !== 'idle' && !(this.state.status === 'disconnected' && !this.state.room))) return;
    this.remember(null);
    this.retryUntil = 0;
    this.update({ ...emptyState, notice: undefined, status: 'connecting' });
    this.connect(this.accessToken ? this.currentRoomRequest() : request, this.accessToken ? request : undefined);
  }

  private gameCommand(command: ClientMessage) {
    if (this.leaving || this.state.status !== 'connected' || this.socket?.readyState !== WebSocket.OPEN) return;
    this.update({ error: null });
    this.send(this.socket,command);
  }
  updateSettings(settings: RoomSettings, expectedRevision = this.state.room?.settingsRevision): Promise<void> {
    if (expectedRevision === undefined) return Promise.reject(new Error('설정 버전을 확인하지 못했어요. 앱과 서버를 업데이트한 뒤 다시 연결해 주세요.'));
    if (this.settingsPending) return Promise.reject(new Error('설정을 저장하고 있어요.'));
    if (this.leaving || this.state.status !== 'connected' || this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('서버 연결 후 다시 시도해 주세요.'));
    return new Promise((resolve, reject) => {
      const requestId = `${this.generation}:${++this.commandSequence}`;
      this.settingsPending = { requestId, resolve, reject, timer: setTimeout(() => { this.finishSettings('저장 응답을 확인하지 못했어요. 다시 연결하여 최신 설정을 확인합니다.'); this.connectionLost('settings_timeout'); }, this.timing.commandTimeoutMs) };
      this.gameCommand({ type: 'updateSettings', settings, expectedRevision, requestId });
    });
  }
  startHand() { this.gameCommand({ type: 'startHand', previousHandId: this.state.room?.holdem?.id ?? null, expectedSettingsRevision: this.state.room?.settingsRevision }); }
  revealRiver(handId: string) { this.gameCommand({ type: 'revealRiver', handId }); }
  revealCards(handId: string) { this.gameCommand({ type: 'revealCards', handId }); }
  resetChips() { const hand = this.state.room?.holdem; if (hand) this.gameCommand({ type: 'resetChips', handId: hand.id }); }
  act(action: PokerAction, amount?: number) {
    const hand = this.state.room?.holdem;
    if (hand) this.gameCommand({ type: 'act', handId: hand.id, revision: hand.revision, action, amount });
  }

  // Native sockets can stay OPEN after an emulator snapshot or a network black hole.
  // Require an application-level response, not just the transport's readyState.
  checkConnection() {
    if (this.state.status === 'disconnected' && (this.session || this.accessToken)) { this.retryUntil = 0; this.connectionLost(); return; }
    if (this.state.status !== 'connected') return;
    if (this.socket?.readyState !== WebSocket.OPEN) { this.connectionLost('socket_not_open'); return; }
    // A delayed/paused JS timer is not evidence of a failed probe. Give a new
    // probe its own budget; also bound a probe stuck waiting for auth/sendQueue.
    if (this.pendingPing !== null) {
      const since = this.pingSentAt ?? this.pingQueuedAt!;
      if (Date.now() - since >= this.timing.heartbeatTimeoutMs) {
        const reason = this.pingSentAt === null ? 'ping_send_timeout' : 'pong_timeout';
        this.diagnostic('client_timeout', {reason}); this.connectionLost(reason);
      }
      return;
    }
    this.pendingPing = ++this.pingSequence;
    this.pingQueuedAt = Date.now(); this.pingSentAt = null;
    this.diagnostic('client_ping_queued', {pingId: this.pendingPing});
    try { this.send(this.socket,{ type: 'ping', id: this.pendingPing }); }
    catch { this.connectionLost('send_failed'); }
  }

  private connect(request: EntryRequest | Extract<ClientMessage, {type: 'currentRoom'}> | { type: 'resume'; code: string; token: string }, entry?: EntryRequest) {
    this.disconnect('new_attempt');
    const generation = this.generation;
    let socket: WebSocket;
    try {
      if (!/^wss?:\/\//.test(this.endpoint)) throw new Error('Invalid WebSocket URL');
      socket = new WebSocket(this.endpoint);
    } catch {
      this.remember(null);
      this.update({ status: 'error', error: '서버 주소가 올바르지 않아요. 실행 설정을 확인해 주세요.' });
      return;
    }
    this.socket = socket;
    const context = {generation, serverId: undefined as string | undefined, connectionId: undefined as string | undefined};
    this.contexts.set(socket, context);
    this.diagnostic('client_connect', {request: request.type});
    let joined = false;
    this.timeout = setTimeout(() => {
      if (generation !== this.generation) return;
      this.diagnostic('client_timeout', {reason: 'join_timeout'});
      // Invalidate callbacks even if the transport never delivers a close event.
      this.connectionLost('join_timeout');
    }, 8_000);
    socket.onopen = () => {
      if (generation === this.generation) { this.diagnostic('client_open'); this.send(socket,request); }
    };
    socket.onmessage = event => {
      if (generation !== this.generation) return;
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.type === 'connection') {
        if (validConnectionId(message.serverId) && validConnectionId(message.connectionId)) {
          context.serverId = message.serverId; context.connectionId = message.connectionId;
          this.diagnostic('client_server_connection');
        }
        return;
      }
      if (message.type === 'noRoom' && !joined) {
        const notice = message.reason ?? (this.state.room || this.session ? 'membership-ended' : undefined);
        this.remember(null);
        if (entry) { const next = entry; entry = undefined; this.send(socket, next); }
        else { this.disconnect('no_room'); this.update({ ...emptyState, notice }); }
      } else if (message.type === 'left') {
        this.disconnect('left'); this.remember(null); this.retryUntil = 0; this.update({ ...emptyState, notice: undefined });
      } else if (message.type === 'settingsUpdated' && joined) {
        const pending = this.settingsPending;
        if (!pending || (message.requestId !== pending.requestId)) return;
        if (this.state.room && (message.settingsRevision ?? 0) >= (this.state.room.settingsRevision ?? 0)) this.update({ room: { ...this.state.room, settings: message.settings, settingsRevision: message.settingsRevision } });
        this.finishSettings();
      } else if (message.type === 'pong' && joined) {
        if (message.id === this.pendingPing) {
          this.diagnostic('client_pong', {pingId: message.id, pingSentAgeMs: this.pingSentAt === null ? undefined : Date.now() - this.pingSentAt});
          this.lastPong = Date.now(); this.pendingPing = null; this.pingQueuedAt = null; this.pingSentAt = null;
        }
      } else if (message.type === 'joined') {
        this.diagnostic('client_joined');
        clearTimeout(this.timeout);
        joined = true;
        this.lastPong = Date.now();
        clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => this.checkConnection(), this.timing.heartbeatMs);
        this.retryUntil = 0;
        this.remember({ code: message.room.code, token: message.token });
        this.update({ status: 'connected', room: message.room, playerId: message.playerId, error: null, notice: undefined });
      } else if (message.type === 'room' && joined) {
        if ((message.room.settingsRevision ?? 0) < (this.state.room?.settingsRevision ?? 0)) return;
        this.update({ room: message.room });
      } else if (message.type === 'error') {
        if (message.requestId && message.requestId !== this.settingsPending?.requestId) return;
        this.finishSettings(message.message);
        if (message.recoverable && joined) { this.leaving = false; clearTimeout(this.leaveTimer); this.update({ error: message.message }); return; }
        if (message.code === 'ALREADY_JOINED' && this.accessToken) { this.connect(this.currentRoomRequest()); return; }
        if ((this.session || this.accessToken) && (message.code === 'AUTH_UNAVAILABLE' || message.code === 'RATE_LIMITED' || message.code === 'SERVER_FULL')) { this.connectionLost('server_retryable_error'); return; }
        this.disconnect();
        if (message.code === 'AUTH_REQUIRED' || message.code === 'SESSION_EXPIRED') {
          if (message.code === 'AUTH_REQUIRED') this.replaced = true;
          this.diagnostic('client_session_rejected', {reason: message.code});
          this.remember(null);
          this.update({ ...emptyState, status: 'error', error: message.message });
        } else this.update({ status: 'error', error: message.message });
      }
    };
    socket.onerror = event => { this.diagnostic('client_socket_error', {...context, stale: generation !== this.generation, failureCategory: transportFailure((event as unknown as {message?:unknown}).message)}); /* onclose/timeout handles recovery. */ };
    socket.onclose = event => {
      this.diagnostic('client_close', {...context, code: event.code, reason: safeCloseReason(event.reason), failureCategory: event.code === 1006 ? transportFailure(event.reason) : undefined, wasClean: event.wasClean, stale: generation !== this.generation});
      if (generation !== this.generation) return;
      clearTimeout(this.timeout);
      if(event.code===4003){this.replaced=true;this.disconnect('account_replaced');this.remember(null);this.update({...emptyState,status:'error',error:'다른 기기에서 로그인하여 접속이 종료됐어요.'});return;}
      if (event.code === 4001) {
        this.replaced = true;
        this.disconnect('session_replaced');
        this.remember(null);
        this.update({ ...emptyState, status: 'error', error: '다른 연결에서 같은 자리에 접속했어요.' });
        return;
      }
      this.connectionLost('remote_close');
    };
  }

  private connectionLost(reason = 'retry_requested') {
    this.diagnostic('client_connection_lost', {
      reason, readyState: this.socket?.readyState, pongAgeMs: Date.now() - this.lastPong,
      pingId: this.pendingPing ?? undefined,
      pingQueuedAgeMs: this.pingQueuedAt === null ? undefined : Date.now() - this.pingQueuedAt,
      pingSentAgeMs: this.pingSentAt === null ? undefined : Date.now() - this.pingSentAt,
    });
    this.disconnect('connection_lost');
    if (!this.session && !this.accessToken) {
      this.update({ status: 'error', error: '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.' });
      return;
    }
    if (!this.retryUntil) this.retryUntil = Date.now() + this.timing.retryWindowMs;
    if (Date.now() >= this.retryUntil) {
      this.update({ status: 'disconnected', error: '연결을 복구하지 못했어요. 연결 재시도를 눌러 주세요.' });
      return;
    }
    this.update({ status: 'reconnecting', error: '연결이 끊어졌어요. 다시 연결하고 있어요.' });
    clearTimeout(this.retryTimer);
    this.diagnostic('client_retry_scheduled', {delayMs: this.timing.retryMs});
    this.retryTimer = setTimeout(() => {
      if (this.accessToken) this.connect(this.currentRoomRequest());
      else if (this.session) this.connect({ type: 'resume', ...this.session });
    }, this.timing.retryMs);
  }

  leave() {
    if (this.leaving) return;
    if (!this.state.room) { this.cancel(); return; }
    const socket = this.socket;
    if (this.state.status !== 'connected' || socket?.readyState !== WebSocket.OPEN) {
      this.update({ error: '서버에 연결한 뒤 방 나가기를 다시 눌러 주세요. 참여 상태는 유지됩니다.' });
      this.refresh();
      return;
    }
    this.leaving = true;
    this.update({ error: null });
    this.leaveTimer = setTimeout(() => { this.connectionLost('leave_timeout'); }, 8000);
    void this.send(socket, { type: 'leave' });
  }
  dispose() {
    this.disposed = true;
    this.disconnect('dispose');
    this.session = null;
  }
}
