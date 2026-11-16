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

test('web viewport follows keyboard resize, preserves pinch zoom and cleans up listeners',()=>{
  const values=new Map(),events=new Map(),visualEvents=new Map();let cleanup,removed=false,meta='width=device-width';
  const visual={height:667,scale:1,addEventListener:(k,f)=>visualEvents.set(k,f),removeEventListener:k=>visualEvents.delete(k)};
  const window={innerHeight:700,visualViewport:visual,addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)};
  const document={createElement:()=>({remove:()=>removed=true}),head:{append(){}},querySelector:()=>({getAttribute:()=>meta,setAttribute:(_k,v)=>meta=v}),documentElement:{style:{setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)}}};
  load('useWebLayout.web.ts',{react:{useEffect:fn=>cleanup=fn()}},{document,window}).useWebLayout();
  assert.equal(values.get('--table-viewport'),'667px');assert.ok(meta.includes('viewport-fit=cover'));assert.ok(!meta.includes('user-scalable=no'));
  visual.height=360;visualEvents.get('resize')();assert.equal(values.get('--table-viewport'),'360px');
  visual.scale=2;visual.height=180;visualEvents.get('resize')();assert.equal(values.get('--table-viewport'),'360px');
  cleanup();assert.equal(events.size+visualEvents.size,0);assert.equal(values.size,0);assert.ok(removed);assert.equal(meta,'width=device-width');
});
