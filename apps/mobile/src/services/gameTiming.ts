import type { HoldemView } from '@boardgame/shared';

/**
 * Opt-in client timing for game progression (observation only).
 * Enable with EXPO_PUBLIC_GAME_TIMING_LOG=1 at build time, or on web with
 * localStorage['friends-table.diagnostics.game-timing'] = '1' and a reload.
 * Durations use this device's monotonic clock (performance.now). Entries are
 * correlated with server logs by handRef (first 8 chars of the public hand id)
 * + revision, never by subtracting wall clocks across devices.
 * Entries never contain cards, nicknames, room codes, tokens or account ids.
 */
export type TimingValue = string | number | boolean | null | undefined;
export type ClientTimingEntry = { event: string; monoMs: number } & Record<string, TimingValue>;
export const GAME_TIMING_STORAGE_KEY = 'friends-table.diagnostics.game-timing';
const CAPACITY = 500;
const RECEIPTS = 64;

export const handRef = (id: string | null | undefined) => id ? id.slice(0, 8) : undefined;
const round = (value: number) => Math.round(value * 10) / 10;

function enabledFromEnvironment(): boolean {
  try { if (process.env.EXPO_PUBLIC_GAME_TIMING_LOG === '1') return true; } catch { /* No process env on this platform. */ }
  try { return (globalThis as { localStorage?: Storage }).localStorage?.getItem(GAME_TIMING_STORAGE_KEY) === '1'; } catch { return false; }
}

export class GameTimingLog {
  enabled = false;
  private sink: (entry: ClientTimingEntry) => void = entry => console.info(JSON.stringify(entry));
  private clock: () => number = () => performance.now();
  private buffer: ClientTimingEntry[] = [];
  private receipts = new Map<string, number>();
  private streets = new Map<string, { street: string; boardCount: number }>();
  configure(options: { enabled: boolean; sink?: (entry: ClientTimingEntry) => void; clock?: () => number }) {
    this.enabled = options.enabled;
    if (options.sink) this.sink = options.sink;
    if (options.clock) this.clock = options.clock;
    this.buffer = []; this.receipts.clear(); this.streets.clear();
  }
  now() { return this.clock(); }
  record(event: string, detail: Record<string, TimingValue> = {}) {
    if (!this.enabled) return;
    try {
      const entry = { event, monoMs: round(this.clock()), ...detail } as ClientTimingEntry;
      this.buffer.push(entry);
      if (this.buffer.length > CAPACITY) this.buffer.shift();
      this.sink(entry);
    } catch { /* Diagnostics must never affect the game. */ }
  }
  /** Milliseconds since this device received the room snapshot for handRef/revision. */
  sinceReceipt(ref: string | undefined, revision: number | undefined): number | undefined {
    const at = ref === undefined || revision === undefined ? undefined : this.receipts.get(`${ref}:${revision}`);
    return at === undefined ? undefined : round(this.clock() - at);
  }
  /** Called when a `room`/`joined` message arrives (before React state updates). */
  roomReceived(kind: 'room' | 'joined', hand: HoldemView | null | undefined, receivedAt: number, bytes: number, parseMs: number) {
    if (!this.enabled) return;
    const ref = handRef(hand?.id);
    if (hand && ref) {
      this.receipts.set(`${ref}:${hand.revision}`, receivedAt);
      if (this.receipts.size > RECEIPTS) this.receipts.delete(this.receipts.keys().next().value!);
    }
    this.record('client_room_received', { kind, handRef: ref, revision: hand?.revision, street: hand?.street, boardCount: hand?.board.length,
      runoutPhase: hand?.runout?.phase ?? null, bytes, parseMs: round(parseMs) });
    if (!hand || !ref) return;
    const previous = this.streets.get(ref);
    if (previous && (previous.street !== hand.street || previous.boardCount !== hand.board.length)) {
      this.record('client_new_street', { handRef: ref, revision: hand.revision, fromStreet: previous.street, toStreet: hand.street,
        fromBoard: previous.boardCount, toBoard: hand.board.length });
    }
    this.streets.set(ref, { street: hand.street, boardCount: hand.board.length });
    if (this.streets.size > 8) this.streets.delete(this.streets.keys().next().value!);
  }
  dump() { return [...this.buffer]; }
}

export const gameTiming = new GameTimingLog();
gameTiming.configure({ enabled: enabledFromEnvironment() });
if (gameTiming.enabled) {
  try { (globalThis as Record<string, unknown>).__friendsTableGameTiming = { dump: () => gameTiming.dump() }; } catch { /* Optional helper. */ }
}
