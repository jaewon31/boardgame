import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bettingPresets, chipLabel } from '../../mobile/src/services/betting.ts';
import type { HoldemView } from '@boardgame/shared';
const hand = { street: 'flop', bigBlind: 20, pot: 200, legal: { callAmount: 40, minRaiseTo: 100, maxRaiseTo: 1000 } } as HoldemView;
test('pot raises include the outstanding call and existing street contribution', () => {
  assert.deepEqual(bettingPresets(hand, 20).map(p => p.value), [140, 180, 300]);
  assert.equal(bettingPresets({ ...hand, legal: { ...hand.legal!, maxRaiseTo: 80 } }, 20)[2].value, 80);
});
test('preflop shortcuts use the configured blind and respect a prior raise', () => {
  assert.deepEqual(bettingPresets({ ...hand, street: 'preflop' }, 0).map(p => p.value), [100, 100, 100]);
  assert.equal(chipLabel(25, 20, true), '1.25 BB');
  assert.deepEqual(bettingPresets({ ...hand, legal: null }, 0), []);
});
