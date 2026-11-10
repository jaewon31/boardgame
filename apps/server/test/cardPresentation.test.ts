import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HoldemView } from '@boardgame/shared';
import { SoundEvents } from '../../mobile/src/services/soundEvents.ts';
import { CardPresentation, HOLE_DURATION_MS, BOARD_DURATION_MS } from '../../mobile/src/services/cardPresentation.ts';
import { AudioScheduler } from '../../mobile/src/services/audioScheduler.ts';
import { soundCatalog } from '../../mobile/src/services/soundCatalog.ts';
const base = {id:'h',number:1,revision:0,street:'preflop',board:[],players:[],payouts:[],actorId:'b',legal:null} as unknown as HoldemView;
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function setup(enabled=true){
 let now=0;
 const trace:{sound:string,time:number}[]=[],ends=new Map<string,()=>void>();
 const players=Object.fromEntries(Object.keys(soundCatalog).map(sound=>[sound,{isLoaded:true,volume:0,pause(){},seekTo:async()=>{},play(){trace.push({sound,time:now});}}]));
 const scheduler=new AudioScheduler({player:s=>players[s],gain:()=>1,onEnd(s,done){ends.set(s,done);return()=>ends.delete(s);},error(){}},()=>now);
 scheduler.setEnabled(enabled);
 const visuals=new CardPresentation(()=>{},()=>now),events=new SoundEvents();
 visuals.restore(base);events.update(base,'a',true,now);
 return {scheduler,visuals,events,trace,ends,players,advance(ms:number){now+=ms;scheduler.tick();},update(h:HoldemView){scheduler.enqueue(visuals.prepare(h,events.update(h,'a',true,now)));}};
}
test('street-ending CHECK precedes three sequential flop sounds and matching 540ms animations',async()=>{
 const a=setup();
 const flop={...base,revision:1,street:'flop',board:['2s','3s','4s'],audioAction:{revision:1,kind:'check'}} as HoldemView;
 a.update(flop);await flush();assert.deepEqual(a.trace,[{sound:'check',time:0}]);assert.equal(a.visuals.state.boardCount,0);
 a.advance(720);a.ends.get('check')!();a.advance(0);await flush();
 for(let i=0;i<3;i++){
  assert.equal(a.visuals.state.boardCount,i+1);
  assert.equal(a.visuals.state.board[i].startedAt,720+i*540);
  assert.equal(a.trace.at(-1)?.time,a.visuals.state.board[i].startedAt);
  assert.equal(a.visuals.state.board[i].durationMs,BOARD_DURATION_MS);
  a.advance(360);a.ends.get('flopReveal')!();a.advance(179);await flush();assert.equal(a.visuals.state.boardCount,i+1);
  a.advance(1);await flush();
 }
 assert.deepEqual(a.trace.map(e=>e.sound),['check','flopReveal','flopReveal','flopReveal']);
 a.update(flop);await flush();assert.equal(a.trace.length,4);
});
test('one hole cue, 360ms unchanged, followed by per-card turn/river at 540ms',async()=>{
 const e=new SoundEvents();e.update(null,'a',true,0);
 const cues=e.update(base,'a',true,1);assert.equal(cues.filter(c=>c.sound==='deal').length,1);
 const v=new CardPresentation(()=>{},()=>10);v.prepare(base,cues)[0].onStart?.();
 assert.equal(v.state.hole?.durationMs,360);assert.equal(HOLE_DURATION_MS,360);assert.equal(BOARD_DURATION_MS,360*1.5);
 const flop={...base,revision:1,board:['2s','3s','4s']} as HoldemView;e.update(flop,'a',true,2);v.restore(flop);
 const turn={...flop,revision:2,board:[...flop.board,'5s']} as HoldemView;
 const tc=v.prepare(turn,e.update(turn,'a',true,3));assert.equal(tc[0].sound,'turnReveal');tc[0].onStart?.();assert.equal(v.state.board[3].durationMs,540);
 const river={...turn,revision:3,board:[...turn.board,'6s']} as HoldemView;
 const rc=v.prepare(river,e.update(river,'a',true,4));assert.equal(rc[0].sound,'riverReveal');rc[0].onStart?.();assert.equal(v.state.board[4].durationMs,540);
});
test('muted visual sequence completes without audio; restore invalidates old callbacks',async()=>{
 const a=setup(false),flop={...base,revision:1,board:['2s','3s','4s']} as HoldemView;
 a.update(flop);await flush();assert.equal(a.visuals.state.boardCount,1);
 a.advance(540);await flush();a.advance(540);await flush();assert.equal(a.visuals.state.boardCount,3);assert.deepEqual(a.trace,[]);
 const old=a.visuals.prepare(flop,[{id:'old',sound:'deal',presentation:{kind:'hole'}}]);
 a.scheduler.cancel();a.visuals.restore(flop);old[0].onStart?.();assert.equal(a.visuals.state.hole,undefined);
 a.events.update(flop,'a',false,0);assert.deepEqual(a.events.update(flop,'a',true,1),[]);
 assert.deepEqual(a.events.update(flop,'a',true,2),[]);
});
test('slow seek falls back to visual-only, never starts a late card sound',async()=>{
 const a=setup();let release!:()=>void;a.players.flopReveal.seekTo=()=>new Promise<void>(r=>{release=r;});
 a.update({...base,revision:1,board:['2s']} as HoldemView);await flush();
 a.advance(201);assert.equal(a.visuals.state.boardCount,1);assert.equal(a.trace.length,0);
 release();await flush();assert.equal(a.trace.length,0);
});
test('rapid CHECK/CALL/RAISE/ALL-IN snapshots retain event identity and never double all-in',()=>{
 const e=new SoundEvents();e.update(base,'a',true,0);
 for(const [i,kind] of (['check','call','raise','raise','check','call'] as const).entries()){
  const cues=e.update({...base,revision:i+1,audioAction:{revision:i+1,kind,...(i===3?{allIn:true}:{})}},'a',true,i+1);
  assert.deepEqual(cues.map(c=>c.sound),[i===3?'allIn':kind]);
 }
});

test('out-of-order hands do not reset or replay presentation state',()=>{
 const v=new CardPresentation(()=>{});
 const newer={...base,id:'next',number:2,revision:4,board:['2s','3s','4s']} as HoldemView;
 v.restore(newer);v.prepare(base,[]);assert.equal(v.state.handId,'next');assert.equal(v.state.boardCount,3);
 v.prepare({...newer,revision:2},[]);assert.equal(v.state.boardCount,3);
});
