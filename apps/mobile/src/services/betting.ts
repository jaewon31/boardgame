import type { HoldemView } from '@boardgame/shared';
export function chipLabel(value: number, bigBlind: number, inBB: boolean): string {
  return inBB ? `${Number((value / bigBlind).toFixed(2))} BB` : value.toLocaleString();
}
export function bettingPresets(hand: HoldemView, roundBet: number) {
  const legal = hand.legal;
  if (!legal) return [];
  const clamp = (value: number) => Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.ceil(value)));
  // A pot raise includes the call, then raises by the pot AFTER that call.
  const target = (ratio: number) => roundBet + legal.callAmount + (hand.pot + legal.callAmount) * ratio;
  return hand.street === 'preflop'
    ? [2.5, 3, 4].map(bb => ({ label: `${bb} BB`, value: clamp(hand.bigBlind * bb) }))
    : [0.33, 0.5, 1].map(ratio => ({ label: `${Math.round(ratio * 100)}% 팟`, value: clamp(target(ratio)) }));
}
