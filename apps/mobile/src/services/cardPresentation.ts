import type { HoldemView } from '@boardgame/shared';
import type { SoundCue } from './soundCatalog.ts';
import type { ScheduledCue } from './audioScheduler.ts';

export const HOLE_DURATION_MS = 360;
export const BOARD_DURATION_MS = 540;
export interface CardMotion { id: string; startedAt: number; durationMs: number }
export interface CardPresentationState { handId: string | null; boardCount: number; board: Record<number, CardMotion>; hole?: CardMotion; holePending?: boolean }

// One presentation state for the whole table; seat count never creates more deal cues.
export class CardPresentation {
  state: CardPresentationState = { handId: null, boardCount: 0, board: {} };
  private generation = 0;
  private previous: HoldemView | null = null;
  private changed: (state: CardPresentationState) => void;
  private clock: () => number;
  constructor(changed: (state: CardPresentationState) => void, clock = () => performance.now()) { this.changed = changed; this.clock = clock; }
  restore(hand: HoldemView | null) {
    this.generation++;
    this.previous = hand;
    this.state = { handId: hand?.id ?? null, boardCount: hand?.board.length ?? 0, board: {} };
    this.changed(this.state);
  }
  prepare(hand: HoldemView | null, cues: SoundCue[]): ScheduledCue[] {
    const before = this.previous;
    if (before && hand && (hand.number < before.number || (hand.id === before.id && hand.revision < before.revision))) return [];
    this.previous = hand;
    if (this.state.handId !== (hand?.id ?? null)) this.restore(hand);
    if (cues.some(cue => cue.presentation?.kind === 'hole')) {
      this.state = { ...this.state, holePending: true };
      this.changed(this.state);
    }
    const generation = this.generation;
    return cues.map(cue => {
      const visual = cue.presentation;
      if (!visual) return cue;
      const durationMs = visual.kind === 'hole' ? HOLE_DURATION_MS : BOARD_DURATION_MS;
      const show = (animate: boolean) => {
        if (generation !== this.generation) return;
        const motion = animate ? { id: cue.id, startedAt: this.clock(), durationMs } : undefined;
        if (visual.kind === 'hole') this.state = { ...this.state, hole: motion, holePending: false };
        else {
          const index = visual.index!;
          const board = { ...this.state.board };
          if (motion) board[index] = motion; else delete board[index];
          this.state = { ...this.state, boardCount: Math.max(this.state.boardCount, index + 1), board };
        }
        this.changed(this.state);
      };
      return { ...cue, minDurationMs: durationMs, onStart: () => show(true), onCancel: () => show(false) };
    });
  }
}
