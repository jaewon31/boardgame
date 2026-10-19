import type { HoldemView } from '@boardgame/shared';
export type GameSound = 'deal' | 'card' | 'chips' | 'turn' | 'warning' | 'win' | 'collect';
export class SoundEvents {
  private previous: HoldemView | null | undefined;
  private warned = '';
  update(hand: HoldemView | null, playerId: string | null, connected: boolean, now: number): GameSound[] {
    if (!connected) { this.previous = undefined; this.warned = ''; return []; }
    const before = this.previous;
    this.previous = hand;
    if (before === undefined) {
      this.warned = hand?.actorId === playerId && hand?.deadline ? `${hand.id}:${hand.deadline}` : '';
      return [];
    }
    if (!hand) { this.warned = ''; return []; }
    const cues: GameSound[] = [];
    if (!before || before.id !== hand.id) {
      if (hand.street === 'preflop' && hand.revision === 0) cues.push('deal');
    } else if (hand.revision > before.revision) {
      if (hand.street === 'complete' && before.street !== 'complete') {
        cues.push(hand.payouts.some(p => p.playerId === playerId && p.amount > 0) ? 'win' : 'collect');
      } else if (hand.board.length > before.board.length) cues.push('card');
      else if (hand.players.some(p => p.totalBet > (before.players.find(old => old.id === p.id)?.totalBet ?? p.totalBet))) cues.push('chips');
    }
    const myTurn = hand.actorId === playerId && !!hand.legal;
    const turnKey = `${hand.id}:${hand.deadline}`;
    if (myTurn && (!before || before.id !== hand.id || before.actorId !== playerId || before.deadline !== hand.deadline)) cues.push('turn');
    if (myTurn && hand.deadline && hand.deadline > now && hand.deadline - now <= 5000 && this.warned !== turnKey) {
      this.warned = turnKey; cues.push('warning');
    }
    return cues;
  }
}
