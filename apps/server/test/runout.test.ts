import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Card } from '@boardgame/shared';
import { newDeck } from '../src/holdem/cards.ts';
import { HoldemHand } from '../src/holdem/hand.ts';

const seeds = (...stacks: number[]) => stacks.map((stack,i)=>({id:String(i),nickname:`p${i}`,stack}));
const deck = (...first: Card[]) => [...first,...newDeck().filter(c=>!first.includes(c))];
const reversal = () => new HoldemHand(seeds(100,100), { deck: deck('13s','14s','13h','14h','9c','2c','4d','7h','10c','8s','11c','13d') });
function allIn(h: HoldemHand) { h.act('0','allIn'); h.act('1','call'); }
function throughTurn(h: HoldemHand) { h.timeout(); h.timeout(); }

test('all-in runout keeps each street visible and never settles before the river is public', () => {
  const h=reversal(); allIn(h);
  let v=h.viewFor('0');
  assert.deepEqual(v.board,[]); assert.equal(v.street,'preflop'); assert.equal(h.actorId,null);
  assert.equal(v.runout?.nextStreet,'flop'); assert.ok(v.deadline! > Date.now()+1500);
  assert.equal(v.legal,null); assert.throws(()=>h.act('0','check'));
  h.timeout(); v=h.viewFor('0');
  assert.deepEqual(v.board,['2c','4d','7h']); assert.equal(v.street,'flop'); assert.equal(v.runout?.nextStreet,'turn');
  h.timeout(); v=h.viewFor('0');
  assert.deepEqual(v.board,['2c','4d','7h','8s']); assert.equal(v.street,'turn');
  assert.equal(v.runout?.nextStreet,'river'); assert.deepEqual(v.payouts,[]);
  h.timeout();
  assert.equal(h.complete,false); assert.equal(h.viewFor('0').board.length,4);
  h.revealRiver('1'); v=h.viewFor('0');
  assert.equal(v.street,'river'); assert.equal(v.board[4],'13d'); assert.deepEqual(v.payouts,[]);
  assert.equal(v.runout?.nextStreet,'showdown');
  h.timeout(); assert.ok(h.complete);
  assert.equal(h.viewFor('0').payouts[0].playerId,'1');
  assert.equal(h.players.reduce((sum,p)=>sum+p.stack,0),200);
});

test('turn loser, not eventual loser, alone receives the private river; wrong callers cannot reveal it', () => {
  const h=reversal(); allIn(h); throughTurn(h); h.timeout();
  const loser=h.viewFor('1'), leader=h.viewFor('0'), spectator=h.viewFor('spectator');
  assert.equal(loser.runout?.playerId,'1'); assert.equal(loser.runout?.card,'13d');
  assert.equal(leader.runout?.card,null); assert.equal(spectator.runout?.card,null);
  assert.equal(JSON.stringify(leader).includes('13d'),false);
  assert.equal(JSON.stringify(spectator).includes('13d'),false);
  assert.ok(loser.runout!.deadline > Date.now()+14000);
  assert.equal(leader.players[1].cards?.length,2); assert.equal(loser.players[0].cards?.length,2);
  assert.ok(spectator.players.every(p=>p.revealed && p.cards?.length===2));
  const before=h.viewFor('0');
  assert.throws(()=>h.revealRiver('0')); assert.throws(()=>h.revealRiver('spectator'));
  assert.deepEqual(h.viewFor('0'),before);
  h.revealRiver('1'); assert.throws(()=>h.revealRiver('1'));
  assert.equal(h.viewFor('spectator').board.length,5);
});

test('timeout and disconnection reveal the river once and do not skip or duplicate cards', () => {
  for(const exit of ['timeout','disconnect','depart'] as const) {
    const h=reversal(); allIn(h); throughTurn(h); h.timeout();
    if(exit==='timeout') h.timeout();
    else if(exit==='depart') h.depart('1');
    else { h.skipDisconnectedSqueeze(['0','1']); assert.equal(h.viewFor('0').board.length,4); h.skipDisconnectedSqueeze(['0']); }
    assert.equal(h.viewFor('0').board.length,5);
    h.skipDisconnectedSqueeze([]); assert.equal(h.viewFor('0').board.length,5);
    h.timeout(); assert.ok(h.complete);
    assert.equal(h.viewFor('0').payouts[0].playerId,'1');
    assert.equal(h.players.reduce((sum,p)=>sum+p.stack,0),200);
  }
});

test('tied turn hands run out automatically with no squeeze owner', () => {
  const h=new HoldemHand(seeds(100,100),{deck:deck('14d','14c','7h','7c','2s','13s','12s','11d','3s','10h','4s','9c')});
  allIn(h); throughTurn(h); h.timeout();
  assert.equal(h.viewFor('0').street,'river'); assert.equal(h.viewFor('0').runout?.playerId,null);
  h.timeout(); assert.ok(h.complete);
  assert.deepEqual(h.players.map(p=>p.stack),[100,100]);
});

test('multiway side pots keep their payouts and choose one turn trailer clockwise from dealer', () => {
  const h=new HoldemHand(seeds(50,100,200),{deck:deck('13s','12s','14s','13h','12h','14h','9c','2c','4d','7h','10c','8s','11c','3d')});
  h.act('0','allIn'); h.act('1','allIn'); h.act('2','call'); throughTurn(h); h.timeout();
  assert.equal(h.viewFor('0').runout?.playerId,'1');
  assert.equal(h.viewFor('2').runout?.card,null);
  h.revealRiver('1'); h.timeout();
  assert.deepEqual(h.viewFor('0').pots,[{amount:150,winnerIds:['0']},{amount:100,winnerIds:['1']}]);
  assert.deepEqual(h.players.map(p=>p.stack),[150,100,100]);
});

test('normal betting never sends a private river and keeps each street actionable', () => {
  const h=reversal();
  for(let i=0;!h.complete && i<20;i++) {
    assert.equal(h.viewFor('0').runout,null);
    const id=h.actorId!;
    h.act(id,h.legalFor(id)!.canCheck?'check':'call');
  }
  assert.ok(h.complete);
});

test('all-in call opens both hands before flop, survives restore and remains public in review',()=>{
 const h=reversal();h.act('0','allIn');
 assert.ok(h.viewFor('spectator').players.every(p=>p.cards===null));
 h.act('1','call');
 assert.equal(h.viewFor('spectator').board.length,0);
 assert.ok(h.viewFor('spectator').players.every(p=>p.revealed&&p.cards?.length===2));
 const restored=HoldemHand.restore(h.checkpoint());
 assert.ok(restored.viewFor('spectator').players.every(p=>p.revealed&&p.cards?.length===2));
 while(!restored.complete)restored.timeout();
 assert.ok(restored.reviewFor('spectator').hand.players.every(p=>p.cards?.length===2));
 assert.ok(restored.players.every(p=>!restored.canReveal(p.id)));
});
test('side-pot betting keeps hands private until river betting ends',()=>{
 const h=new HoldemHand(seeds(50,200,200));
 h.act('0','allIn');h.act('1','call');h.act('2','call');
 assert.equal(h.viewFor('spectator').street,'flop');
 while(!h.complete){
   assert.ok(h.viewFor('spectator').players.every(p=>p.cards===null));
   h.act(h.actorId!,'check');
 }
 assert.ok(h.viewFor('spectator').players.every(p=>p.cards?.length===2));
});
test('uncalled all-in and folded participants stay private',()=>{
 const uncalled=reversal();uncalled.act('0','allIn');uncalled.act('1','fold');
 assert.ok(uncalled.viewFor('spectator').players.every(p=>p.cards===null));
 const h=new HoldemHand(seeds(100,100,100));
 h.act('0','fold');h.act('1','allIn');h.act('2','call');
 assert.equal(h.viewFor('spectator').players[0].cards,null);
 assert.ok(h.viewFor('spectator').players.slice(1).every(p=>p.cards?.length===2));
});
