import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Card } from '@boardgame/shared';
import { evaluate, newDeck, shuffledDeck } from '../src/holdem/cards.ts';
import { HoldemHand } from '../src/holdem/hand.ts';
const seeds = (...stacks: number[]) => stacks.map((stack, i) => ({ id: String(i), nickname: `p${i}`, stack }));
const deck = (...first: Card[]) => [...first, ...newDeck().filter(c => !first.includes(c))];
const score = (s: string) => evaluate(s.split(' ') as Card[]).score;

test('showdown losers stay secret until their own reveal; winners show automatically', () => {
  const h = new HoldemHand(seeds(100,100,100), { deck: deck('13s','12s','14s','13h','12h','14h','9c','2c','4d','7h','10c','8s','11c','3d') });
  assert.throws(() => h.revealCards('0'));
  checkDown(h);
  const before = h.viewFor('spectator');
  assert.deepEqual(before.players.map(p=>p.revealed), [true,false,false]);
  assert.deepEqual(before.players.map(p=>p.cards?.length ?? 0), [2,0,0]);
  assert.equal(h.viewFor('1').canReveal,true);
  assert.equal(h.viewFor('0').canReveal,false);
  assert.equal(h.viewFor('spectator').canReveal,false);
  assert.equal(h.viewFor('1').players[1].cards?.length,2);
  assert.throws(()=>h.revealCards('spectator'));
  const payouts=before.payouts, stacks=before.players.map(p=>p.stack);
  h.revealCards('1');
  assert.equal(h.viewFor('2').players[1].cards?.length,2);
  assert.equal(h.viewFor('0').players[2].cards,null);
  assert.equal(h.viewFor('1').canReveal,false);
  const revision=h.revision;
  h.revealCards('1'); assert.equal(h.revision,revision);
  assert.deepEqual(h.viewFor('0').payouts,payouts);
  assert.deepEqual(h.viewFor('0').players.map(p=>p.stack),stacks);
});

test('folded hands and fold wins cannot reveal; a new hand starts with private cards', () => {
  const h=new HoldemHand(seeds(100,100));
  h.act('0','fold');
  assert.throws(()=>h.revealCards('0')); assert.throws(()=>h.revealCards('1'));
  const next=new HoldemHand(seeds(100,100));
  assert.ok(next.viewFor('spectator').players.every(p=>!p.revealed && p.cards===null));
});
function drainRunout(hand: HoldemHand) { for (let i=0;hand.viewFor('spectator').runout && i<10;i++) hand.timeout(); }
function checkDown(hand: HoldemHand) {
  for (let i = 0; !hand.complete && i < 100; i++) {
    if (hand.viewFor('spectator').runout) { hand.timeout(); continue; }
    const id = hand.actorId!;
    hand.act(id, hand.legalFor(id)!.canCheck ? 'check' : 'call');
  }
  assert.ok(hand.complete);
}
test('all hand categories, wheel, kickers, seven-card best hand and suit-independent ties', () => {
  const ranks = ['14s 11h 9d 6c 3s', '14s 14h 9d 6c 3s', '14s 14h 9d 9c 3s', '14s 14h 14d 6c 3s', '6s 5h 4d 3c 2s', '14s 11s 9s 6s 3s', '14s 14h 14d 6c 6s', '14s 14h 14d 14c 3s', '14s 13s 12s 11s 10s'].map(score);
  ranks.forEach((v, i) => { if (i) assert.ok(v > ranks[i - 1]); });
  assert.ok(score('6s 5h 4d 3c 2s') > score('14s 5h 4d 3c 2s'));
  assert.ok(score('14s 14h 13d 9c 3s') > score('14c 14d 12h 9s 3h'));
  assert.equal(score('14s 13s 12s 11s 10s 2d 3h'), score('14h 13h 12h 11h 10h'));
  assert.equal(new Set(shuffledDeck()).size, 52);
});
test('heads-up order, blind option, private cards, all streets and chip conservation', () => {
  const h = new HoldemHand(seeds(1000, 1000));
  assert.equal(h.actorId, '0');
  assert.equal(h.viewFor('0').players[1].cards, null);
  assert.equal(h.viewFor('1').players[1].cards?.length, 2);
  const before = h.viewFor('0');
  assert.throws(() => h.act('1', 'fold'));
  assert.throws(() => h.act('0', 'check'));
  assert.throws(() => h.act('0', 'raise', 39));
  assert.deepEqual(h.viewFor('0'), before);
  h.act('0', 'call');
  assert.equal(h.actorId, '1');
  h.act('1', 'check');
  assert.equal(h.viewFor('0').street, 'flop');
  assert.equal(h.actorId, '1');
  checkDown(h);
  assert.equal(h.viewFor('0').board.length, 5);
  assert.ok(h.viewFor('0').players.every(p => p.id === '0' || p.revealed ? p.cards?.length === 2 : p.cards === null));
  assert.equal(h.players.reduce((s, p) => s + p.stack, 0), 2000);
});
test('fold win returns unmatched chips without exposing opponent cards', () => {
  const h = new HoldemHand(seeds(1000, 1000));
  h.act('0', 'raise', 100);
  h.act('1', 'fold');
  const view = h.viewFor('1');
  assert.equal(view.players[0].cards, null);
  assert.equal(view.players[0].stack, 1020);
  assert.deepEqual(view.refunds, [{ playerId: '0', amount: 80 }]);
});
test('short all-in does not reopen betting; cumulative full raise does', () => {
  const h = new HoldemHand(seeds(1000, 130, 1000));
  h.act('0', 'raise', 100); h.act('1', 'allIn'); h.act('2', 'call');
  assert.equal(h.legalFor('0')!.canRaise, false);
  assert.throws(() => h.act('0', 'allIn'));
  h.act('0', 'call');
  assert.equal(h.viewFor('0').street, 'flop');
  const multi = new HoldemHand(seeds(140, 180, 1000, 1000));
  multi.act('3', 'raise', 100); multi.act('0', 'allIn'); multi.act('1', 'allIn'); multi.act('2', 'call');
  assert.equal(multi.legalFor('3')!.canRaise, true);
  assert.equal(multi.legalFor('3')!.minRaiseTo, 260);
});
test('different all-in stacks create main/side pots and refund unmatched excess', () => {
  // Deal B,C,A twice; A=aces, B=kings, C=queens, dry board.
  const h = new HoldemHand(seeds(50, 100, 200), { deck: deck('13s','12s','14s','13h','12h','14h','9c','2c','4d','7h','10c','8s','11c','3d') });
  h.act('0', 'allIn'); h.act('1', 'allIn'); h.act('2', 'call');
  drainRunout(h);
  const v = h.viewFor('0');
  assert.ok(h.complete);
  assert.deepEqual(v.pots, [{ amount: 150, winnerIds: ['0'] }, { amount: 100, winnerIds: ['1'] }]);
  assert.deepEqual(v.players.map(p => p.stack), [150, 100, 100]);
});
test('shared board splits pot; odd chip starts left of dealer', () => {
  const h = new HoldemHand(seeds(100,100,100), { deck: deck('2c','3c','4c','5d','6d','7d','8c','10s','11s','12s','9c','13s','9d','14s') });
  h.act('0','raise',41); h.act('1','call'); h.act('2','call');
  h.act('1','check'); h.act('2','fold'); h.act('0','check');
  checkDown(h);
  assert.deepEqual(h.viewFor('0').payouts.map(p => [p.playerId,p.amount]), [['1',62],['0',61]]);
  assert.equal(h.viewFor('0').players[2].cards,null);
});
test('short blind runs out, timeout folds/checks, and departure preserves other turn clock', () => {
  const short = new HoldemHand(seeds(1000,5));
  drainRunout(short);
  assert.ok(short.complete);
  assert.equal(short.viewFor('0').pot,10);
  const h = new HoldemHand(seeds(1000,1000,1000));
  const deadline=h.deadline;
  h.depart('1');
  assert.equal(h.actorId,'0'); assert.equal(h.deadline,deadline);
  h.timeout(); assert.ok(h.complete);
  const check = new HoldemHand(seeds(1000,1000));
  check.act('0','call'); check.timeout();
  assert.equal(check.viewFor('0').street,'flop');
});
test('500 varied hands never create chips, reveal hidden cards or get stuck', () => {
  let random=123456;
  const next=() => { random=(Math.imul(random,1664525)+1013904223)>>>0; return random; };
  for(let trial=0;trial<500;trial++) {
    const players=seeds(...Array.from({length:2+next()%5},()=>1+next()%1000));
    const total=players.reduce((s,p)=>s+p.stack,0);
    const h=new HoldemHand(players,{dealerIndex:next()%players.length});
    for(let turn=0;!h.complete && turn<300;turn++) {
      if (h.viewFor('spectator').runout) { h.timeout(); continue; }
      const id=h.actorId!, legal=h.legalFor(id)!;
      const v=h.viewFor(id);
      assert.ok(v.players.filter(p=>p.id!==id).every(p=>p.cards===null));
      assert.equal(v.players.reduce((s,p)=>s+p.stack+p.totalBet,0),total);
      const n=next()%5;
      h.act(id,n===0?'fold':n===1&&legal.canAllIn?'allIn':legal.canCheck?'check':'call');
    }
    assert.ok(h.complete); assert.equal(h.players.reduce((s,p)=>s+p.stack,0),total);
    assert.ok(h.players.every(p=>p.stack>=0));
  }
});
