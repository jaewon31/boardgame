const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../../..');
const ts=require(require.resolve('typescript',{paths:[root]}));

// Execute the actual hook and scheduler; only React/native/storage boundaries are stubbed.
function harness(saved=null){
  const slots=[],players=[],subscriptions=new Set(),timers=new Set(),writes=[];
  let cursor=0,dirty=false,effects=[],result,hand=null,connected=true;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const react={
    useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{const next=typeof value==='function'?value(slots[i].value):value;if(!Object.is(next,slots[i].value)){slots[i].value=next;dirty=true;}}];},
    useRef(value){const i=cursor++;slots[i]??={current:value};return slots[i];},
    useMemo(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){const prior=slots[i];slots[i]={deps,cleanup:prior?.cleanup};effects.push(()=>{prior?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  const native={AppState:{currentState:'active',addEventListener(_event,fn){subscriptions.add(fn);return {remove(){subscriptions.delete(fn);}};}}};
  const audio={setAudioModeAsync:async()=>{},useAudioPlayer(source){return react.useMemo(()=>{
    const listeners=new Set();
    const p={source,isLoaded:true,ended:false,volume:0,plays:0,pauses:0,seek:null,
      get currentStatus(){return {isLoaded:this.isLoaded||this.ended};},
      pause(){this.pauses++;},seekTo(){return (this.seek?.()??Promise.resolve()).then(()=>{this.isLoaded=true;this.ended=false;});},play(){this.plays++;},
      addListener(_event,fn){listeners.add(fn);return {remove(){listeners.delete(fn);}};},
      finish(){this.isLoaded=false;this.ended=true;for(const fn of [...listeners])fn({didJustFinish:true});},
    };players.push(p);return p;
  },[]);}};
  const file=path.join(root,'apps/mobile/src/hooks/useGameAudio.ts');
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(code,{exports,performance,Date,Promise,setInterval(fn){timers.add(fn);return fn;},clearInterval(fn){timers.delete(fn);},require(id){
    if(id==='react')return react;if(id==='react-native')return native;if(id==='expo-audio')return audio;
    if(id==='expo-secure-store')return {getItemAsync:async()=>saved,setItemAsync:async(_key,value)=>{writes.push(JSON.parse(value));}};
    if(id.endsWith('.wav'))return id;
    if(id.startsWith('../services/'))return require(path.join(root,'apps/mobile/src/services',id.split('/').at(-1)+'.ts'));
    throw Error(id);
  }},{filename:file});
  function render(){let limit=0;do{dirty=false;cursor=0;effects=[];result=exports.useGameAudio(hand,'a',connected);effects.forEach(fn=>fn());if(++limit>20)throw Error('Render loop');}while(dirty);return result;}
  async function flush(){for(let i=0;i<10;i++){await Promise.resolve();if(dirty)render();}}
  render();
  return {players,writes,render,flush,get audio(){return result;},setHand(value){hand=value;render();},
    connect(value){connected=value;render();},tick(){timers.forEach(fn=>fn());render();},
    appState(value,renderNow=true){native.AppState.currentState=value;subscriptions.forEach(fn=>fn(value));if(renderNow)render();},
    dispose(){slots.forEach(s=>s?.cleanup?.());},
  };
}

test('audio hook loads per-event settings and master mute cancels deferred native play',async()=>{
  const h=harness(JSON.stringify({level:0.5,muted:false,gains:{myTurn:0.2}}));
  await h.flush();assert.equal(h.audio.loaded,true);assert.equal(h.audio.gains.myTurn,0.2);
  let release;h.players[11].seek=()=>new Promise(r=>{release=r;});h.audio.preview();
  h.audio.setMuted(true);release();await h.flush();assert.equal(h.players[11].plays,0);
  assert.equal(h.writes.at(-1).muted,true);h.dispose();
});

test('background and reconnect suppress catch-up cues and cancel pending preview',async()=>{
  const h=harness();await h.flush();
  const base={id:'hand',number:1,revision:0,street:'preflop',board:[],players:[],payouts:[],actorId:'b',deadline:10000,legal:null};
  h.setHand(base);await h.flush();h.players[0].finish();h.tick();
  const previous=h.players.reduce((n,p)=>n+p.plays,0);
  h.appState('background');h.setHand({...base,revision:1,audioAction:{revision:1,kind:'call'}});h.appState('active');await h.flush();
  assert.equal(h.players.reduce((n,p)=>n+p.plays,0),previous);
  h.connect(false);h.setHand({...base,revision:2,audioAction:{revision:2,kind:'raise'}});h.connect(true);await h.flush();
  assert.equal(h.players.reduce((n,p)=>n+p.plays,0),previous);
  let release;h.players[11].seek=()=>new Promise(r=>{release=r;});h.audio.preview();h.appState('background');release();await h.flush();
  assert.equal(h.players[11].plays,0);h.dispose();
});

test('independent event gains persist and apply through the Expo adapter',async()=>{
  const h=harness();await h.flush();h.audio.setSoundGain('call',0.2);await h.flush();
  h.audio.preview('call');await h.flush();assert.equal(h.players[2].volume,0.1);assert.equal(h.players[2].plays,1);
  assert.equal(h.writes.at(-1).gains.call,0.2);
  h.audio.setSoundGain('call',0);await h.flush();assert.equal(h.players[2].volume,0);h.dispose();
});

test('batched background/foreground events do not leave playback disabled',async()=>{
  const h=harness();await h.flush();
  h.appState('background',false);h.appState('active');
  h.audio.preview();await h.flush();assert.equal(h.players[11].plays,1);h.dispose();
});

test('every preview resolves the expected independent player and asset, including replay after STATE_ENDED',async()=>{
  const h=harness();await h.flush();h.audio.setPreviewMode(true);await h.flush();
  const mapping=[['deal','card-deal.wav'],['check','card.wav'],['call','chips-bet.wav'],['bet','chips-bet.wav'],['raise','chips-raise.wav'],['fold','cards-fold.wav'],['flopReveal','card-reveal.wav'],['turnReveal','card-reveal.wav'],['riverReveal','card-reveal.wav'],['potCollect','pot-collect.wav'],['victory','win.wav'],['myTurn','turn.wav'],['warning','warning.wav']];
  for(let i=0;i<mapping.length;i++){
    const [sound,file]=mapping[i];assert.ok(h.players[i].source.endsWith('/'+file));
    h.audio.preview(sound);await h.flush();assert.equal(h.players[i].plays,1,sound);
    h.players[i].finish();h.audio.preview(sound);await h.flush();assert.equal(h.players[i].plays,2,sound+' replay');
    h.players[i].finish();
  }
  assert.notEqual(h.players[2],h.players[3]);h.dispose();
});
test('preview is latest-selection-wins and game/connection changes cannot cancel an open audition',async()=>{
  const h=harness();await h.flush();h.audio.setPreviewMode(true);await h.flush();
  let release;h.players[2].seek=()=>new Promise(r=>{release=r;});
  h.audio.preview('call');h.audio.preview('raise');h.audio.preview('fold');await h.flush();
  release();await h.flush();assert.equal(h.players[2].plays,0);assert.equal(h.players[4].plays,0);assert.equal(h.players[5].plays,1);
  const paused=h.players[5].pauses;
  h.setHand({id:'new',number:1,revision:0,street:'preflop',board:[],players:[],payouts:[],actorId:'b',legal:null});
  h.connect(false);await h.flush();assert.equal(h.players[5].pauses,paused);
  h.audio.setPreviewMode(false);await h.flush();assert.ok(h.players[5].pauses>paused);h.dispose();
});
test('real winning hand sends pot and victory through the hook once',async()=>{
  const {HoldemHand}=require(path.join(root,'apps/server/src/holdem/hand.ts'));
  const hand=new HoldemHand([{id:'a',nickname:'A',stack:100},{id:'b',nickname:'B',stack:100}]);
  const h=harness();await h.flush();h.setHand(hand.viewFor('a',true));await h.flush();h.players[0].finish();h.tick();
  hand.depart('b');h.setHand(hand.viewFor('a',true));await h.flush();assert.equal(h.players[9].plays,1);
  h.players[9].finish();h.tick();await h.flush();assert.equal(h.players[10].plays,1);
  h.setHand(hand.viewFor('a',true));h.tick();await h.flush();assert.equal(h.players[10].plays,1);h.dispose();
});
