import type { HoldemView } from '@boardgame/shared';
import type { SoundCue, GameSound } from './soundCatalog.ts';
export type { GameSound } from './soundCatalog.ts';

// State restoration is silent. Only newly observed authoritative transitions play.
export class SoundEvents {
  private previous: HoldemView | null | undefined;
  private warned = '';
  private completedHand = '';
  private shuffledHand = '';
  update(hand: HoldemView | null, playerId: string | null, connected: boolean, now: number, nextHandAt?: number | null): SoundCue[] {
    if (!connected) { this.previous = undefined; this.warned = ''; this.completedHand = ''; this.shuffledHand = ''; return []; }
    const before = this.previous;
    if (before && hand && (hand.number < before.number || (hand.id === before.id && hand.revision < before.revision))) return [];
    this.previous = hand;
    if (before === undefined) {
      this.warned = hand?.actorId === playerId && hand?.deadline ? `${hand.id}:${hand.deadline}` : '';
      return [];
    }
    if (!hand) { this.warned = ''; return []; }
    const cues: SoundCue[] = [];
    const emit = (sound: GameSound, key: string | number = hand.revision, presentation?: SoundCue['presentation']) => cues.push({ id: `${hand.id}:${key}:${sound}`, sound, ...(presentation ? { presentation } : {}) });
    if (!before || before.id !== hand.id) {
      if (hand.street === 'preflop' && hand.revision === 0) emit('deal', 'hole', { kind: 'hole' });
    } else if (hand.revision > before.revision) {
      // Optional metadata supports old servers without guessing actions from display text.
      const action = hand.audioAction;
      if (action && action.revision > before.revision && action.revision <= hand.revision) emit(action.allIn ? 'allIn' : action.kind, action.revision);
      // Independent transitions: a street-ending call must not hide the card sound.
      if (hand.board.length > before.board.length) {
        for (let index = before.board.length; index < hand.board.length; index++) {
          emit(index < 3 ? 'flopReveal' : index === 3 ? 'turnReveal' : 'riverReveal', 'board:' + index, { kind: 'board', index });
        }
      }
      if (hand.street === 'complete' && before.street !== 'complete') {
        this.completedHand = hand.id;
        emit('potCollect');
        if (hand.payouts.some(p => p.playerId === playerId && p.amount > 0)) emit('victory');
      }
    }
    if (hand.street === 'complete' && this.completedHand === hand.id && this.shuffledHand !== hand.id
      && nextHandAt && nextHandAt - now <= 6500 && nextHandAt - now >= 6000) {
      this.shuffledHand = hand.id;
      emit('shuffle', 'between-hands');
    }
    const myTurn = hand.actorId === playerId && !!hand.legal;
    const turnKey = `${hand.id}:${hand.deadline}`;
    if (myTurn && (!before || before.id !== hand.id || before.actorId !== playerId || before.deadline !== hand.deadline)) emit('myTurn', `turn:${hand.deadline}`);
    if (myTurn && hand.deadline && hand.deadline > now && hand.deadline - now <= 5000 && this.warned !== turnKey) {
      this.warned = turnKey; emit('warning', `turn:${hand.deadline}`);
    }
    return cues;
  }
}
