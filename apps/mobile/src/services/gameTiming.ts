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
  private receipts = new Map<string, { at: number; duplicates: number }>();
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
    const receipt = ref === undefined || revision === undefined ? undefined : this.receipts.get(`${ref}:${revision}`);
    return receipt === undefined ? undefined : round(this.clock() - receipt.at);
  }
  /**
   * Called when a `room`/`joined` message arrives (before React state updates).
   * The baseline for a handRef+revision is its FIRST `room` receipt: later copies of the same
   * revision (another player's reconnect, join, next-hand scheduling) only count as duplicates.
   * A `joined` snapshot starts a new baseline: after (re)connecting the client restores the
   * table instead of animating, so earlier receipts no longer describe what is on screen.
   * A new hand has a new handRef and therefore always a fresh baseline.
   */
  roomReceived(kind: 'room' | 'joined', hand: HoldemView | null | undefined, receivedAt: number, bytes: number, parseMs: number) {
    if (!this.enabled) return;
    const ref = handRef(hand?.id);
    let duplicates = 0, baseline: 'first' | 'duplicate' | 'reset' | undefined;
    let sinceFirstReceiptMs: number | undefined;
    if (hand && ref) {
      const key = `${ref}:${hand.revision}`, existing = this.receipts.get(key);
      if (existing && kind === 'room') {
        existing.duplicates++; duplicates = existing.duplicates; baseline = 'duplicate';
        sinceFirstReceiptMs = round(receivedAt - existing.at);
      } else {
        baseline = existing ? 'reset' : 'first';
        this.receipts.delete(key);
        this.receipts.set(key, { at: receivedAt, duplicates: 0 });
        if (this.receipts.size > RECEIPTS) this.receipts.delete(this.receipts.keys().next().value!);
      }
    }
    this.record('client_room_received', { kind, handRef: ref, revision: hand?.revision, street: hand?.street, boardCount: hand?.board.length,
      runoutPhase: hand?.runout?.phase ?? null, bytes, parseMs: round(parseMs), baseline, duplicates, sinceFirstReceiptMs });
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

/**
 * First animation frame after the presented board changes (≈ committed to screen), attributed to
 * the revision whose state introduced the change (set by the card observer via `source`), not to
 * the latest received revision. Delayed reveals (waiting behind action audio) keep their origin.
 */
export function boardFrameTracker(log: GameTimingLog, raf: (callback: () => void) => unknown = callback => requestAnimationFrame(callback)) {
  let shown: { handId: string | null; boardCount: number } = { handId: null, boardCount: 0 };
  let revision: number | undefined;
  return {
    source(sourceRevision: number | undefined) { revision = sourceRevision; },
    changed(state: { handId: string | null; boardCount: number }) {
      if (!log.enabled || (state.handId === shown.handId && state.boardCount === shown.boardCount)) return;
      shown = { handId: state.handId, boardCount: state.boardCount };
      const ref = handRef(state.handId), boardCount = state.boardCount, source = revision;
      raf(() => log.record('client_board_frame', { handRef: ref, revision: source, boardCount, sinceReceiptMs: log.sinceReceipt(ref, source) }));
    },
  };
}

export const gameTiming = new GameTimingLog();
gameTiming.configure({ enabled: enabledFromEnvironment() });
if (gameTiming.enabled) {
  try { (globalThis as Record<string, unknown>).__friendsTableGameTiming = { dump: () => gameTiming.dump() }; } catch { /* Optional helper. */ }
}
