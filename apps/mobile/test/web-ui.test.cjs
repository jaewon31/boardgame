const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
function load(file,imports={},globals={}) {
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,setTimeout,clearTimeout,...globals,require:id=>imports[id]??require(id)});return exports;
}
function ui(navigator={}) {
  const jsx=(type,props)=>({type,props});
  return load('platformUI.web.tsx',{
    react:{useState:()=>['',()=>{}],useSyncExternalStore:(_subscribe,get)=>get()},
    'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':{...Object.fromEntries(['Modal','Pressable','Text','TextInput','View'].map(k=>[k,k])),StyleSheet:{create:x=>x}},
  },{navigator});
}
function nodes(tree){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...nodes(tree.props?.children)];}
function press(api,label){const n=nodes(api.WebDialogs()).find(n=>n.type==='Pressable'&&nodes(n).some(c=>c.type==='Text'&&c.props.children===label));assert.ok(n,label);n.props.onPress();}
test('web confirmations preserve cancel/destructive callbacks and queued alerts',()=>{
  const api=ui();let accepted=0;
  api.Alert.alert('Leave?','',[{text:'Cancel',style:'cancel'},{text:'Leave',onPress:()=>accepted++}]);
  api.Alert.alert('Next');press(api,'Cancel');assert.equal(accepted,0);press(api,'확인');assert.equal(api.WebDialogs(),null);
  api.Alert.alert('Leave?','',[{text:'Leave',onPress:()=>accepted++}]);press(api,'Leave');assert.equal(accepted,1);
});
test('web copying succeeds or offers selectable text when browser clipboard is denied',async()=>{
  let copied='';const api=ui({clipboard:{writeText:async text=>{copied=text;}}});
  await api.copyText('ROOM2345');assert.equal(copied,'ROOM2345');press(api,'확인');
  const denied=ui({clipboard:{writeText:async()=>{throw Error('denied');}}});
  const done=denied.copyText('ROOM2345');await new Promise(r=>setImmediate(r));
  assert.equal(nodes(denied.WebDialogs()).find(n=>n.type==='TextInput').props.value,'ROOM2345');press(denied,'닫기');await done;
});
test('web sharing always offers copy UI without depending on native share availability',async()=>{
  const api=ui();const done=api.Share.share({message:'https://example.test/join/ABCD2345'});
  assert.equal(nodes(api.WebDialogs()).find(n=>n.type==='TextInput').props.value,'https://example.test/join/ABCD2345');press(api,'닫기');await done;
});
test('web lifecycle resumes visible tabs, ignores hidden resume events and removes listeners',()=>{
  const events=()=>{const handlers=new Map();return {handlers,addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:(k,f)=>{if(handlers.get(k)===f)handlers.delete(k);}};};
  const document={...events(),visibilityState:'visible'},window=events();let resumed=0;const states=[];
  const {watchRoomLifecycle}=load('roomLifecycle.web.ts',{}, {document,window});
  const dispose=watchRoomLifecycle({recordAppState:s=>states.push(s),resynchronize:()=>resumed++});
  document.visibilityState='hidden';document.handlers.get('visibilitychange')();window.handlers.get('online')();assert.equal(resumed,0);
  document.visibilityState='visible';document.handlers.get('visibilitychange')();window.handlers.get('online')();window.handlers.get('pageshow')();assert.equal(resumed,3);assert.ok(states.includes('background'));
  dispose();assert.equal(document.handlers.size+window.handlers.size,0);
});

function viewportHarness({touch=true,visual=true}={}) {
  const target=()=>{const listeners=new Map();return {listeners,addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};};
  class Element {closest(){return null;}}
  class Input extends Element {readOnly=false;disabled=false;type='text';}
  class TextArea extends Element {}
  const values=new Map(),vv={...target(),height:800,offsetTop:0,scale:1};let scheduled;
  const window={...target(),innerHeight:800,innerWidth:390,matchMedia:()=>({matches:touch}),requestAnimationFrame:fn=>(scheduled=fn,1),cancelAnimationFrame:()=>scheduled=null,...(visual?{visualViewport:vv}:{})};
  const document={...target(),activeElement:null,documentElement:{style:{setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)}}};
  const api=load('webViewport.ts',{}, {window,document,HTMLElement:Element,HTMLInputElement:Input,HTMLTextAreaElement:TextArea});
  const dispose=api.watchWebViewport();
  return {window,document,vv,values,dispose,focus(){document.activeElement=new Input();document.listeners.get('focusin')();},blur(){document.activeElement=null;document.listeners.get('focusout')();},flush(){const f=scheduled;scheduled=null;f?.();},resize(height){vv.height=height;(visual?vv:window).listeners.get('resize')();this.flush();}};
}
test('touch keyboard keeps table height while input viewport and Safari offset track visible area',()=>{
 const h=viewportHarness();h.focus();h.resize(460);assert.equal(h.values.get('--table-viewport'),'800px');assert.equal(h.values.get('--input-viewport'),'460px');
 h.vv.offsetTop=32;h.vv.listeners.get('scroll')();h.flush();assert.equal(h.values.get('--visual-top'),'32px');
 h.blur();h.flush();assert.equal(h.values.get('--table-viewport'),'800px');h.vv.offsetTop=0;h.resize(800);assert.equal(h.values.get('--visual-top'),'0px');
 h.dispose();assert.equal(h.values.size,0);assert.equal(h.window.listeners.size+h.document.listeners.size+h.vv.listeners.size,0);
});
test('desktop resize is not frozen by a focused hardware-keyboard input',()=>{
 const h=viewportHarness({touch:false});h.focus();h.resize(600);assert.equal(h.values.get('--table-viewport'),'600px');h.dispose();
});
test('orientation updates layout, pinch zoom does not change viewport variables',()=>{
 const h=viewportHarness();h.focus();h.resize(460);h.vv.scale=2;h.resize(200);assert.equal(h.values.get('--input-viewport'),'460px');
 h.vv.scale=1;h.window.innerWidth=844;h.window.innerHeight=390;h.resize(220);assert.equal(h.values.get('--table-viewport'),'390px');h.blur();h.resize(390);h.dispose();
});
test('without VisualViewport the window resize fallback still preserves the touch table',()=>{
 const h=viewportHarness({visual:false});h.focus();h.window.innerHeight=450;h.resize(450);assert.equal(h.values.get('--table-viewport'),'800px');assert.equal(h.values.get('--input-viewport'),'450px');h.blur();h.window.innerHeight=800;h.resize(800);h.dispose();
});
