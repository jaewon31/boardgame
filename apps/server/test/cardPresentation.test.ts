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
test('street-ending CHECK: the whole flop appears on receipt as one 360ms unit while CHECK and one flop sound play',async()=>{
 const a=setup();
 const flop={...base,revision:1,street:'flop',board:['2s','3s','4s'],audioAction:{revision:1,kind:'check'}} as HoldemView;
 a.update(flop);await flush();
 assert.equal(a.visuals.state.boardCount,3,'cards never wait for the CHECK sound');
 for(let i=0;i<3;i++){assert.equal(a.visuals.state.board[i].startedAt,0);assert.equal(a.visuals.state.board[i].durationMs,BOARD_DURATION_MS);}
 assert.equal(a.visuals.state.board[0],a.visuals.state.board[2],'one shared motion for the flop');
 assert.deepEqual(a.trace,[{sound:'check',time:0},{sound:'flopReveal',time:0}]);
 a.advance(720);a.ends.get('check')!();a.ends.get('flopReveal')!();a.advance(0);await flush();
 a.update(flop);await flush();assert.equal(a.trace.length,2,'a repeated snapshot replays nothing');
});
test('one hole cue, 240ms, followed by one turn and one river card at 360ms, all shown on receipt',async()=>{
 const e=new SoundEvents();e.update(null,'a',true,0);
 const cues=e.update(base,'a',true,1);assert.equal(cues.filter(c=>c.sound==='deal').length,1);
 const v=new CardPresentation(()=>{},()=>10);v.prepare(base,cues);
 assert.equal(v.state.hole?.durationMs,240);assert.equal(v.state.hole?.startedAt,10);assert.equal(v.state.holePending,false);
 assert.equal(HOLE_DURATION_MS,240);assert.equal(BOARD_DURATION_MS,240*1.5);
 const flop={...base,revision:1,board:['2s','3s','4s']} as HoldemView;e.update(flop,'a',true,2);v.restore(flop);
 const turn={...flop,revision:2,board:[...flop.board,'5s']} as HoldemView;
 const tc=v.prepare(turn,e.update(turn,'a',true,3));assert.equal(tc[0].sound,'turnReveal');assert.equal(v.state.boardCount,4);assert.equal(v.state.board[3].durationMs,360);
 assert.equal(v.state.board[2],undefined,'restored flop does not animate again');
 const river={...turn,revision:3,board:[...turn.board,'6s']} as HoldemView;
 const rc=v.prepare(river,e.update(river,'a',true,4));assert.equal(rc[0].sound,'riverReveal');assert.equal(v.state.boardCount,5);assert.equal(v.state.board[4].durationMs,360);
});
test('muted: identical card timing without any audio; restore shows the table statically',async()=>{
 const on=setup(true),off=setup(false),flop={...base,revision:1,board:['2s','3s','4s'],audioAction:{revision:1,kind:'check'}} as HoldemView;
 on.update(flop);off.update(flop);await flush();
 assert.deepEqual(off.visuals.state,on.visuals.state,'same visual state with sound ON and OFF');
 assert.equal(off.visuals.state.boardCount,3);assert.deepEqual(off.trace,[]);
 off.visuals.restore(flop);assert.deepEqual(off.visuals.state.board,{});assert.equal(off.visuals.state.boardCount,3);
 off.events.update(flop,'a',false,0);assert.deepEqual(off.events.update(flop,'a',true,1),[]);
 assert.deepEqual(off.events.update(flop,'a',true,2),[]);
});
test('slow seek never starts a late card sound; the card itself is already shown',async()=>{
 const a=setup();let release!:()=>void;a.players.flopReveal.seekTo=()=>new Promise<void>(r=>{release=r;});
 a.update({...base,revision:1,board:['2s','3s','4s']} as HoldemView);await flush();
 assert.equal(a.visuals.state.boardCount,3);assert.equal(a.trace.length,0);
 a.advance(501);release();await flush();assert.equal(a.trace.length,0);
});
test('rapid CHECKs before the turn: the turn card is shown on receipt and only the newest action is heard',async()=>{
 const a=setup(),flop={...base,revision:1,street:'flop',board:['2s','3s','4s']} as HoldemView;
 a.update(flop);await flush();a.ends.get('flopReveal')?.();
 for(let r=2;r<=5;r++){a.advance(100);a.update({...flop,revision:r,audioAction:{revision:r,kind:'check'}} as HoldemView);await flush();}
 a.advance(100);const turnAt=500;
 a.update({...flop,revision:6,street:'turn',board:[...flop.board,'5s'],audioAction:{revision:6,kind:'check'}} as HoldemView);await flush();
 assert.equal(a.visuals.state.boardCount,4);assert.equal(a.visuals.state.board[3].startedAt,turnAt,'turn card starts on receipt, not behind queued CHECKs');
 assert.deepEqual(a.trace.slice(-2),[{sound:'check',time:turnAt},{sound:'turnReveal',time:turnAt}]);
 assert.equal(a.trace.filter(t=>t.sound==='check').length,5,'each CHECK starts on its own state; none is queued for later');
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
