import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HoldemView } from '@boardgame/shared';
import { SoundEvents } from '../../mobile/src/services/soundEvents.ts';
import { HoldemHand } from '../src/holdem/hand.ts';
const base = {id:'one',number:1,revision:0,street:'preflop',board:[],players:[],payouts:[],actorId:'b',deadline:30000,legal:null} as unknown as HoldemView;
const sounds = (cues: ReturnType<SoundEvents['update']>) => cues.map(c=>c.sound);

test('audio suppresses initial/resumed state, duplicate and out-of-order snapshots',()=>{
  const s=new SoundEvents(); assert.deepEqual(s.update(base,'a',true,0),[]);
  const bet={...base,revision:1,audioAction:{revision:1,kind:'call' as const}};
  assert.deepEqual(sounds(s.update(bet,'a',true,1)),['call']);
  assert.deepEqual(s.update(base,'a',true,2),[]);
  assert.deepEqual(s.update(bet,'a',true,3),[]);
  s.update(bet,'a',false,4);
  assert.deepEqual(s.update({...bet,street:'complete',revision:2},'a',true,5),[]);
});

test('each public action is selected without parsing user-controlled lastEvent',()=>{
  for(const kind of ['check','call','bet','raise','fold'] as const){
    const s=new SoundEvents();s.update(base,'a',true,0);
    const next={...base,revision:1,audioAction:{revision:1,kind},lastEvent:'PRIVATE_NAME: 체크'};
    const cues=s.update(next,'a',true,1);
    assert.deepEqual(sounds(cues),[kind]);
    assert.ok(!JSON.stringify(cues).includes('PRIVATE_NAME'));
    assert.deepEqual(s.update({...next,revision:2},'a',true,2),[]);
  }
});

test('street-ending action, board and turn are independent; payouts and warning are once only',()=>{
  const s=new SoundEvents();s.update(null,'a',true,0);
  assert.deepEqual(sounds(s.update(base,'a',true,1)),['deal']);
  const flop={...base,revision:1,street:'flop',board:['2s','3s','4s'],actorId:'a',legal:{canCheck:true,callAmount:0,canRaise:true,minRaiseTo:20,maxRaiseTo:1000,canAllIn:true},deadline:10000,
    audioAction:{revision:1,kind:'call'}} as HoldemView;
  assert.deepEqual(sounds(s.update(flop,'a',true,2)),['call','flopReveal','myTurn']);
  assert.deepEqual(sounds(s.update(flop,'a',true,5000)),['warning']);
  assert.deepEqual(s.update(flop,'a',true,6000),[]);
  const turn={...flop,revision:2,street:'turn',board:[...flop.board,'5s'],actorId:null,legal:null} as HoldemView;
  assert.deepEqual(sounds(s.update(turn,'a',true,6001)),['turnReveal']);
  const squeeze={...turn,revision:3,runout:{phase:'squeezing',nextStreet:'river',deadline:20000,playerId:'a',card:'6s'}} as HoldemView;
  assert.deepEqual(s.update(squeeze,'a',true,6002),[]);
  const river={...turn,revision:4,street:'river',board:[...turn.board,'6s']} as HoldemView;
  assert.deepEqual(sounds(s.update(river,'a',true,6003)),['riverReveal']);
  const end={...river,revision:5,street:'complete',payouts:[{playerId:'a',amount:40,handName:'pair'}]} as HoldemView;
  assert.deepEqual(sounds(s.update(end,'a',true,7000)),['potCollect','victory']);
  assert.deepEqual(s.update(end,'a',true,7100),[]);
});

test('older servers do not produce guessed actions; previous hands cannot replay',()=>{
  const s=new SoundEvents();s.update(base,'a',true,0);
  assert.deepEqual(s.update({...base,revision:1,lastEvent:'콜'},'a',true,1),[]);
  const next={...base,id:'two',number:2};
  const cue=s.update(next,'a',true,2);
  assert.deepEqual(sounds(cue),['deal']);
  assert.deepEqual(s.update(base,'a',true,3),[]);
  assert.deepEqual(s.update(next,'a',true,4),[]);
});

const seeds = () => [{id:'a',nickname:'A',stack:1000},{id:'b',nickname:'B',stack:1000}];
test('real engine reports call/check/bet/raise/fold without changing checkpoint schema',()=>{
  const h=new HoldemHand(seeds());
  h.act(h.actorId!,'call');assert.equal(h.viewFor('a',true).audioAction?.kind,'call');
  h.act(h.actorId!,'check');assert.equal(h.viewFor('a',true).audioAction?.kind,'check');
  assert.equal(h.viewFor('a',true).street,'flop');
  h.act(h.actorId!,'raise',20);assert.equal(h.viewFor('a',true).audioAction?.kind,'bet');
  h.act(h.actorId!,'raise',40);assert.equal(h.viewFor('a',true).audioAction?.kind,'raise');
  h.act(h.actorId!,'fold');assert.equal(h.viewFor('a',true).audioAction?.kind,'fold');
  const saved=h.checkpoint();assert.ok(!('audioAction' in saved));
  const restored=HoldemHand.restore(saved);
  const {audioAction,...view}=h.viewFor('a',true);
  assert.deepEqual(restored.viewFor('a',true),view);
  assert.deepEqual(Object.keys(audioAction!).sort(),['kind','revision']);
});

test('all-in call, opening all-in, raising all-in, timeout and departure classify by accepted action',()=>{
  const short=new HoldemHand([{id:'a',nickname:'A',stack:15},{id:'b',nickname:'B',stack:100}]);
  short.act(short.actorId!,'allIn');assert.equal(short.viewFor('a',true).audioAction?.kind,'call');
  const raise=new HoldemHand(seeds());raise.act(raise.actorId!,'allIn');assert.equal(raise.viewFor('a',true).audioAction?.kind,'raise');
  const bet=new HoldemHand(seeds());bet.act(bet.actorId!,'call');bet.act(bet.actorId!,'check');bet.act(bet.actorId!,'allIn');
  assert.equal(bet.viewFor('a',true).audioAction?.kind,'bet');
  const expired=new HoldemHand(seeds());expired.timeout();assert.equal(expired.viewFor('a',true).audioAction?.kind,'fold');
  const departure=new HoldemHand(seeds());departure.depart('b');assert.equal(departure.viewFor('a',true).audioAction?.kind,'fold');
});
