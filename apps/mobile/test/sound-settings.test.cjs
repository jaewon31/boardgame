const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..'),ts=require(require.resolve('typescript',{paths:[root]}));
test('rendered preview buttons route all 15 named events and disable Android click sounds',()=>{
 const {soundCatalog,defaultSoundGains}=require(path.join(root,'apps/mobile/src/services/soundCatalog.ts'));
 let open=false;const calls=[],modes=[],nodes=[];const jsx=(type,props)=>({type,props:props||{}});
 const exports={};const file=path.join(root,'apps/mobile/src/components/SoundSettings.tsx');
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require(id){
  if(id==='react')return {useState:()=>[open,v=>{open=v;}],useEffect:()=>{}};
  if(id==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
  if(id==='react-native')return {...Object.fromEntries(['Modal','Pressable','ScrollView','Text','View'].map(v=>[v,v])),StyleSheet:{create:v=>v}};
  if(id==='../services/soundCatalog')return {soundCatalog};throw Error(id);
 }});
 const audio={loaded:true,muted:false,level:.5,gains:defaultSoundGains,error:null,setMuted(){},setLevel(){},setSoundGain(){},setPreviewMode:v=>modes.push(v),preview:s=>calls.push(s)};
 function render(){nodes.length=0;function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}nodes.push(n);walk(n.props?.children);}walk(exports.SoundSettings({audio}));}
 render();nodes.find(n=>n.type==='Pressable').props.onPress();assert.equal(modes.at(-1),true);render();
 for(const [sound,info] of Object.entries(soundCatalog)){
  const button=nodes.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel===info.label+' 미리듣기');assert.ok(button,sound);
  assert.equal(button.props.android_disableSound,true);button.props.onPress();assert.equal(calls.at(-1),sound);
 }
 assert.equal(calls.length,15);nodes.find(n=>n.type==='Modal').props.onRequestClose();assert.equal(modes.at(-1),false);
});
