import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioScheduler, type SoundPlayer } from '../../mobile/src/services/audioScheduler.ts';
import { soundCatalog, defaultSoundGains, readSoundGains, type GameSound, type SoundCue } from '../../mobile/src/services/soundCatalog.ts';
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
const cue=(sound:GameSound,id:string=sound):SoundCue=>({sound,id});
function setup(){
  let now=0,errors=0;
  const played:GameSound[]=[],paused:GameSound[]=[];
  const listeners=new Map<GameSound,()=>void>();
  const pending=new Map<GameSound,()=>Promise<void>>();
  const gains={...defaultSoundGains};
  const players=Object.fromEntries(Object.keys(soundCatalog).map(key=>{
    const sound=key as GameSound;
    return [sound,{isLoaded:true,volume:0,pause(){paused.push(sound);},seekTo(){return pending.get(sound)?.()??Promise.resolve();},play(){played.push(sound);}}];
  })) as unknown as Record<GameSound,SoundPlayer & {isLoaded:boolean}>;
  const scheduler=new AudioScheduler({player:s=>players[s],gain:s=>gains[s],error:()=>{errors++;},
    onEnd:(s,done)=>{listeners.set(s,done);return()=>{if(listeners.get(s)===done)listeners.delete(s);};}},()=>now);
  scheduler.setEnabled(true);
  return {scheduler,players,played,paused,pending,gains,listeners,advance:(ms:number)=>{now+=ms;scheduler.tick();},get errors(){return errors;}};
}
test('same event is played once, including re-enable and repeated snapshots',async()=>{
  const a=setup();a.scheduler.enqueue([cue('call'),cue('call')]);await flush();
  assert.deepEqual(a.played,['call']);a.listeners.get('call')!();a.scheduler.tick();
  a.scheduler.setEnabled(false);a.scheduler.setEnabled(true);a.scheduler.enqueue([cue('call')]);await flush();
  assert.deepEqual(a.played,['call']);
});
test('new high priority cue never cuts a playing cue; waiting priority and separate notice lane apply',async()=>{
  const a=setup();a.scheduler.enqueue([cue('deal')]);await flush();
  a.scheduler.enqueue([cue('check'),cue('potCollect'),cue('myTurn')]);await flush();
  assert.deepEqual(a.played,['deal','myTurn']);assert.equal(a.paused.filter(s=>s==='deal').length,1);
  a.listeners.get('deal')!();a.scheduler.tick();await flush();assert.equal(a.played.at(-1),'potCollect');
  a.listeners.get('potCollect')!();a.scheduler.tick();await flush();assert.equal(a.played.at(-1),'check');
});
test('mute/background/reconnect cancellation prevents pending seek from starting and serializes same voice',async()=>{
  const a=setup();let release!:()=>void;
  a.pending.set('call',()=>new Promise<void>(r=>{release=r;}));
  a.scheduler.enqueue([cue('call','old')]);await flush();
  a.scheduler.setEnabled(false);a.scheduler.setEnabled(true);
  a.scheduler.enqueue([cue('call','new')]);await flush();assert.deepEqual(a.played,[]);
  a.pending.delete('call');release();await flush();assert.deepEqual(a.played,[]);
  a.scheduler.tick();await flush();assert.deepEqual(a.played,['call']);
  a.scheduler.setEnabled(false);assert.equal(a.listeners.size,0);
});
test('stale completion cannot end a newer playback',async()=>{
  const a=setup();a.scheduler.enqueue([cue('call','one')]);await flush();const stale=a.listeners.get('call')!;
  a.scheduler.setEnabled(false);a.scheduler.setEnabled(true);a.scheduler.enqueue([cue('call','two')]);await flush();
  stale();a.scheduler.enqueue([cue('check')]);await flush();assert.deepEqual(a.played,['call','call']);
  a.listeners.get('call')!();a.scheduler.tick();await flush();assert.equal(a.played.at(-1),'check');
});
test('unloaded audio waits briefly, expired bursts drop and muted events are not replayed',async()=>{
  const a=setup();a.players.call.isLoaded=false;a.scheduler.enqueue([cue('call')]);await flush();assert.deepEqual(a.played,[]);
  a.players.call.isLoaded=true;a.advance(100);await flush();assert.deepEqual(a.played,['call']);
  a.scheduler.enqueue([cue('check')]);a.advance(1600);a.listeners.get('call')!();a.scheduler.tick();await flush();assert.deepEqual(a.played,['call']);
  a.scheduler.setEnabled(false);a.scheduler.enqueue([cue('raise')]);a.scheduler.setEnabled(true);a.scheduler.enqueue([cue('raise')]);await flush();assert.deepEqual(a.played,['call']);
});
test('seek rejection releases lane and reports a safe error; no raw error is forwarded',async()=>{
  const a=setup();a.pending.set('call',()=>Promise.reject(new Error('PRIVATE_PATH')));
  a.scheduler.enqueue([cue('call')]);await flush();assert.equal(a.errors,1);assert.deepEqual(a.played,[]);
  a.scheduler.enqueue([cue('check')]);await flush();assert.deepEqual(a.played,['check']);
});
test('independent gains apply at actual play and update without restarting',async()=>{
  const a=setup();let release!:()=>void;a.pending.set('call',()=>new Promise<void>(r=>{release=r;}));
  a.scheduler.enqueue([cue('call')]);a.gains.call=0.13;release();await flush();assert.equal(a.players.call.volume,0.13);
  a.gains.call=0.07;a.scheduler.refreshVolumes();assert.equal(a.players.call.volume,0.07);assert.deepEqual(a.played,['call']);
  const parsed=readSoundGains({call:0.2,bet:NaN,raise:2,fold:-1,warning:'0.5'});
  assert.equal(parsed.call,0.2);assert.equal(parsed.bet,defaultSoundGains.bet);assert.equal(parsed.raise,defaultSoundGains.raise);
});
test('missing native completion eventually releases lane without keeping pending sounds',async()=>{
  const a=setup();a.scheduler.enqueue([cue('call')]);await flush();a.advance(5001);
  assert.equal(a.errors,1);assert.equal(a.listeners.size,0);
  a.scheduler.enqueue([cue('check')]);await flush();assert.deepEqual(a.played,['call','check']);
});

test('Android STATE_ENDED direct isLoaded=false still allows replay from loaded currentStatus',async()=>{
  const a=setup();a.scheduler.enqueue([cue('call','first')]);await flush();
  a.players.call.isLoaded=false;
  Object.defineProperty(a.players.call,'currentStatus',{value:{isLoaded:true,playbackState:'ended'}});
  a.listeners.get('call')!();a.scheduler.enqueue([cue('call','second')]);await flush();
  assert.deepEqual(a.played,['call','call']);
});
test('an unavailable high-priority player must not block another ready sound',async()=>{
  const a=setup();a.players.potCollect.isLoaded=false;
  a.scheduler.enqueue([cue('potCollect'),cue('victory')]);await flush();
  assert.deepEqual(a.played,['victory']);
});
test('victory survives a previous effect plus pot collection in the same result update',async()=>{
  const a=setup();a.scheduler.enqueue([cue('deal')]);await flush();
  a.scheduler.enqueue([cue('potCollect'),cue('victory')]);
  a.advance(900);a.listeners.get('deal')!();a.scheduler.tick();await flush();
  a.advance(834);a.listeners.get('potCollect')!();a.scheduler.tick();await flush();
  assert.deepEqual(a.played,['deal','potCollect','victory']);
});
test('asynchronous native volume setter must not cancel playback using its old getter value',async()=>{
  const a=setup();let written=0;
  Object.defineProperty(a.players.call,'volume',{get:()=>0,set:value=>{written=value;}});
  a.scheduler.enqueue([cue('call')]);await flush();assert.ok(written>0);assert.deepEqual(a.played,['call']);
});

test('shuffle can finish beyond five seconds, but its missing callback remains bounded', async () => {
  const a = setup();
  a.scheduler.enqueue([cue('shuffle')]); await flush();
  a.advance(5700); await flush();
  assert.equal(a.errors, 0);
  assert.ok(a.listeners.has('shuffle'));
  a.listeners.get('shuffle')!();
  a.scheduler.tick();
  assert.equal(a.listeners.size, 0);
  a.scheduler.enqueue([cue('shuffle', 'second')]); await flush();
  a.advance(7501);
  assert.equal(a.errors, 1);
  assert.equal(a.listeners.size, 0);
});
