import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {HoldemView} from '@boardgame/shared';
import {SoundEvents} from '../../mobile/src/services/soundEvents.ts';
const base={id:'one',revision:0,street:'preflop',board:[],players:[{id:'a',totalBet:10}],payouts:[],actorId:'b',deadline:30000,legal:null} as unknown as HoldemView;
test('audio suppresses initial/resumed state and duplicate updates',()=>{
 const s=new SoundEvents();assert.deepEqual(s.update(base,'a',true,0),[]);
 const bet={...base,revision:1,players:[{...base.players[0],totalBet:20}]};
 assert.deepEqual(s.update(bet,'a',true,1),['chips']);assert.deepEqual(s.update(bet,'a',true,2),[]);
 s.update(bet,'a',false,3);
 assert.deepEqual(s.update({...bet,street:'complete',revision:2},'a',true,4),[]);
});
test('deal, board, turn warning and payout trigger once',()=>{
 const s=new SoundEvents();s.update(null,'a',true,0);
 assert.deepEqual(s.update(base,'a',true,1),['deal']);
 const flop={...base,revision:1,street:'flop',board:['2s','3s','4s'],actorId:'a',legal:{canCheck:true,callAmount:0,canRaise:true,minRaiseTo:20,maxRaiseTo:100,canAllIn:true},deadline:10000} as HoldemView;
 assert.deepEqual(s.update(flop,'a',true,2),['card','turn']);
 assert.deepEqual(s.update(flop,'a',true,5000),['warning']);assert.deepEqual(s.update(flop,'a',true,6000),[]);
 const end={...flop,revision:2,street:'complete',actorId:null,legal:null,payouts:[{playerId:'a',amount:40,handName:'원페어'}]} as HoldemView;
 assert.deepEqual(s.update(end,'a',true,7000),['win']);assert.deepEqual(s.update(end,'a',true,7100),[]);
});
