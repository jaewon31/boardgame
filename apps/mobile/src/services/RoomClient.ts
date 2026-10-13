import type { ClientMessage, PokerAction, EntryRequest, LobbyRoom, ServerMessage } from '@boardgame/shared';

export interface RoomState {
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  room: LobbyRoom | null;
  playerId: string | null;
  error: string | null;
}
const emptyState: RoomState = { status: 'idle', room: null, playerId: null, error: null };

// Keep networking separate from React so reconnect and cancellation can be tested.
export interface ConnectionTiming { heartbeatMs?: number; heartbeatTimeoutMs?: number; retryMs?: number }
export interface SavedSession { code: string; token: string }
export interface SessionStore { load(): Promise<SavedSession | null>; save(session: SavedSession | null): Promise<void> }
export class RoomClient {
  private storage?: SessionStore;
  private writes: Promise<void> = Promise.resolve();
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private lastPong = 0;
  private pendingPing: number | null = null;
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

  constructor(endpoint: string, notify: (state: RoomState) => void, timing: ConnectionTiming = {}, storage?: SessionStore) {
    this.storage = storage;
    this.timing = { heartbeatMs: timing.heartbeatMs ?? 5000, heartbeatTimeoutMs: timing.heartbeatTimeoutMs ?? 15000, retryMs: timing.retryMs ?? 1000 };
    this.endpoint = endpoint;
    this.notify = notify;
  }

  private remember(session: SavedSession | null) {
    this.session = session;
    if (!this.storage) return;
    this.writes = this.writes.then(() => this.storage!.save(session)).catch(() => {
      this.update({ error: '기기에 재접속 정보를 저장하지 못했어요. 앱 종료 후에는 자리를 복구하지 못할 수 있어요.' });
    });
  }
  async restore() {
    if (!this.storage || this.state.status !== 'idle') return;
    this.update({ status: 'connecting' });
    const generation = this.generation;
    try {
      const saved = await this.storage.load();
      if (generation !== this.generation) return;
      if (!saved) { this.update({ status: 'idle' }); return; }
      this.session = saved;
      this.connect({ type: 'resume', ...saved });
    } catch {
      if (generation === this.generation) this.update({ status:'idle', error:'저장된 자리를 복구하지 못했어요. 초대 코드로 입장해 주세요.' });
    }
  }
  private update(patch: Partial<RoomState>) {
    this.state = { ...this.state, ...patch };
    this.notify(this.state);
  }
  private disconnect() {
    this.generation++;
    clearInterval(this.heartbeat);
    this.pendingPing = null;
    clearTimeout(this.retryTimer);
    clearTimeout(this.timeout);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  enter(request: EntryRequest) {
    if (this.state.status !== 'idle' && !(this.state.status === 'disconnected' && !this.state.room)) return;
    this.remember(null);
    this.retryUntil = 0;
    this.update({ ...emptyState, status: 'connecting' });
    this.connect(request);
  }

  private gameCommand(command: ClientMessage) {
    if (this.state.status !== 'connected' || this.socket?.readyState !== WebSocket.OPEN) return;
    this.update({ error: null });
    this.socket.send(JSON.stringify(command));
  }
  startHand() { this.gameCommand({ type: 'startHand', previousHandId: this.state.room?.holdem?.id ?? null }); }
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
    if (this.state.status === 'disconnected' && this.session) { this.retryUntil = 0; this.connectionLost(); return; }
    if (this.state.status !== 'connected') return;
    if (Date.now() - this.lastPong >= this.timing.heartbeatTimeoutMs || this.socket?.readyState !== WebSocket.OPEN) {
      this.connectionLost();
      return;
    }
    if (this.pendingPing !== null) return;
    this.pendingPing = ++this.pingSequence;
    try { this.socket.send(JSON.stringify({ type: 'ping', id: this.pendingPing })); }
    catch { this.connectionLost(); }
  }

  private connect(request: EntryRequest | { type: 'resume'; code: string; token: string }) {
    this.disconnect();
    const generation = this.generation;
    let socket: WebSocket;
    try {
      if (!/^wss?:\/\//.test(this.endpoint)) throw new Error('Invalid WebSocket URL');
      socket = new WebSocket(this.endpoint);
    } catch {
      this.remember(null);
      this.update({ ...emptyState, error: '서버 주소가 올바르지 않아요. 실행 설정을 확인해 주세요.' });
      return;
    }
    this.socket = socket;
    let joined = false;
    this.timeout = setTimeout(() => {
      if (generation !== this.generation) return;
      // Invalidate callbacks even if the transport never delivers a close event.
      this.disconnect();
      this.connectionLost();
    }, 8_000);
    socket.onopen = () => {
      if (generation === this.generation) socket.send(JSON.stringify(request));
    };
    socket.onmessage = event => {
      if (generation !== this.generation) return;
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.type === 'pong' && joined) {
        if (message.id === this.pendingPing) { this.lastPong = Date.now(); this.pendingPing = null; }
      } else if (message.type === 'joined') {
        clearTimeout(this.timeout);
        joined = true;
        this.lastPong = Date.now();
        clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => this.checkConnection(), this.timing.heartbeatMs);
        this.retryUntil = 0;
        this.remember({ code: message.room.code, token: message.token });
        this.update({ status: 'connected', room: message.room, playerId: message.playerId, error: null });
      } else if (message.type === 'room' && joined) {
        this.update({ room: message.room });
      } else if (message.type === 'error') {
        if (message.recoverable && joined) { this.update({ error: message.message }); return; }
        if (this.session && (message.code === 'RATE_LIMITED' || message.code === 'SERVER_FULL')) { this.connectionLost(); return; }
        this.disconnect();
        this.remember(null);
        this.update({ ...emptyState, error: message.message });
      }
    };
    socket.onerror = () => { /* onclose or timeout handles failures consistently. */ };
    socket.onclose = event => {
      if (generation !== this.generation) return;
      clearTimeout(this.timeout);
      if (event.code === 4001) {
        this.disconnect();
        this.remember(null);
        this.update({ ...emptyState, error: '다른 연결에서 같은 자리에 접속했어요.' });
        return;
      }
      this.connectionLost();
    };
  }

  private connectionLost() {
    this.disconnect();
    if (!this.session) {
      this.update({ ...emptyState, error: '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.' });
      return;
    }
    if (!this.retryUntil) this.retryUntil = Date.now() + 300_000;
    if (Date.now() >= this.retryUntil) {
      this.update({ status: 'disconnected', error: '연결을 복구하지 못했어요. 나간 뒤 초대 코드로 다시 입장해 주세요.' });
      return;
    }
    this.update({ status: 'reconnecting', error: '연결이 끊겼어요. 자동으로 다시 연결하고 있습니다.' });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (this.session) this.connect({ type: 'resume', ...this.session });
    }, this.timing.retryMs);
  }

  leave() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'leave' }));
    this.disconnect();
    this.remember(null);
    this.retryUntil = 0;
    this.update(emptyState);
  }
  dispose() {
    this.disconnect();
    this.session = null;
  }
}
