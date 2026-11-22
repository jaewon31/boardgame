import type { HoldemView } from '@boardgame/shared';
import type { SoundCue } from './soundCatalog.ts';
import type { ScheduledCue } from './audioScheduler.ts';

export const HOLE_DURATION_MS = 240;
export const BOARD_DURATION_MS = 360;
export interface CardMotion { id: string; startedAt: number; durationMs: number }
/** Optional timing observer (diagnostics only); never receives card values. */
export type CardTimingObserver = (event: string, detail: { handId: string | null; revision?: number; kind: 'hole' | 'board'; index?: number; boardCount?: number; animated: boolean }) => void;
export interface CardPresentationState { handId: string | null; boardCount: number; board: Record<number, CardMotion>; hole?: CardMotion; holePending?: boolean }

// One presentation state for the whole table; seat count never creates more deal cues.
// Cards are revealed when the authoritative state arrives, never when a sound starts:
// audio can lag, be muted or be dropped, and the table must look the same in every case.
export class CardPresentation {
  state: CardPresentationState = { handId: null, boardCount: 0, board: {} };
  private previous: HoldemView | null = null;
  private changed: (state: CardPresentationState) => void;
  private clock: () => number;
  private observe?: CardTimingObserver;
  constructor(changed: (state: CardPresentationState) => void, clock = () => performance.now(), observe?: CardTimingObserver) {
    this.changed = changed; this.clock = clock; this.observe = observe;
  }
  private report(event: string, detail: Parameters<CardTimingObserver>[1]) {
    try { this.observe?.(event, detail); } catch { /* Diagnostics only. */ }
  }
  restore(hand: HoldemView | null) {
    this.previous = hand;
    this.report('client_board_restore', { handId: hand?.id ?? null, revision: hand?.revision, kind: 'board', boardCount: hand?.board.length ?? 0, animated: false });
    this.state = { handId: hand?.id ?? null, boardCount: hand?.board.length ?? 0, board: {} };
    this.changed(this.state);
  }
  /** Applies the visual change for `hand` immediately and returns its sound cues (audio only). */
  prepare(hand: HoldemView | null, cues: SoundCue[]): ScheduledCue[] {
    const before = this.previous;
    if (before && hand && (hand.number < before.number || (hand.id === before.id && hand.revision < before.revision))) return [];
    this.previous = hand;
    if (this.state.handId !== (hand?.id ?? null)) this.restore(hand);
    const now = this.clock();
    let next = this.state;
    if (hand && cues.some(cue => cue.presentation?.kind === 'hole')) {
      this.report('client_card_reveal', { handId: hand.id, revision: hand.revision, kind: 'hole', animated: true });
      next = { ...next, hole: { id: `${hand.id}:hole`, startedAt: now, durationMs: HOLE_DURATION_MS }, holePending: false };
    }
    const target = hand?.board.length ?? 0;
    if (hand && target > next.boardCount) {
      // Every card that became visible in this state shares one motion: the flop is one unit.
      const from = next.boardCount, motion = { id: `${hand.id}:board:${from}`, startedAt: now, durationMs: BOARD_DURATION_MS };
      const board = { ...next.board };
      for (let index = from; index < target; index++) board[index] = motion;
      this.report('client_card_reveal', { handId: hand.id, revision: hand.revision, kind: 'board', index: from, boardCount: target, animated: true });
      next = { ...next, boardCount: target, board };
    }
    if (next !== this.state) { this.state = next; this.changed(this.state); }
    // Diagnostics only: tag cues with the revision that produced them (absent when not observed).
    return this.observe ? cues.map(cue => ({ ...cue, sourceRevision: hand?.revision })) : cues;
  }
}
