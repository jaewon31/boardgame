const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..'),ts=require(require.resolve('typescript',{paths:[root]}));
function compile(file,require){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,performance:{now:()=>100}});return exports;}
const jsx=(type,props)=>({type,props:props||{}});
test('rendered table gives all players identical hole motion and hides pending board faces',()=>{
 const {PokerTable}=compile('apps/mobile/src/components/PokerTable.tsx',id=>{
  if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(id==='react-native')return {View:'View',Text:'Text',Pressable:'Pressable',StyleSheet:{create:v=>v}};
  if(id==='./WinnerGlow')return {WinnerGlow:'WinnerGlow'};
  if(id==='./PokerCards')return {PlayingCard:'PlayingCard'};
  if(id==='../services/betting')return {chipLabel:v=>String(v)};
  throw Error(id);
 });
 const players=['a','b','c'].map(id=>({id,nickname:id,stack:100,roundBet:0,cards:['As','Kh']}));
 const hand={id:'h',players,payouts:[],board:['2s','3s','4s'],bigBlind:20,smallBlind:10,pot:40};
 const hole={id:'h:hole',startedAt:100,durationMs:360};
 const board={0:{id:'h:board:0',startedAt:100,durationMs:540}};
 const tree=PokerTable({room:{holdem:hand,players:players.map(p=>({...p,connected:true}))},playerId:'a',width:400,height:600,seconds:20,connected:true,onReveal(){},presentation:{handId:'h',hole,boardCount:1,board}});
 const cards=[];function walk(n){if(!n)return;if(Array.isArray(n))return n.forEach(walk);if(typeof n!=='object')return;if(typeof n.type==='function')return walk(n.type(n.props));if(n.type==='PlayingCard')cards.push(n.props);walk(n.props?.children);}walk(tree);
 const holes=cards.filter(p=>p.width===24||p.width===44&&p.motion===hole);
 assert.equal(holes.length,6);assert.ok(holes.every(p=>p.motion===hole));assert.ok(holes.every(p=>!('delay' in p)));
 const community=cards.filter(p=>p.motion!==hole);assert.equal(community.length,5);assert.equal(community[0].card,'2s');assert.equal(community[1].card,undefined);assert.equal(community[2].card,undefined);
});
test('PlayingCard runs 360/540ms motion, static restore does not animate, reduced motion stays static',()=>{
 for(const reduced of [false,true]){
  const timings=[],values=[];
  const {PlayingCard}=compile('apps/mobile/src/components/PokerCards.tsx',id=>{
   if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};
   if(id==='react')return {useRef:v=>({current:v}),useState:()=>[reduced,()=>{}],useEffect:fn=>fn(),useLayoutEffect:fn=>fn()};
   if(id==='./CardArtwork')return {CardArtwork:'CardArtwork'};
   if(id==='react-native')return {View:'View',AccessibilityInfo:{isReduceMotionEnabled:async()=>reduced,addEventListener:()=>({remove(){}})},Easing:{out:v=>v,cubic:'cubic'},Animated:{View:'AnimatedView',Value:class{setValue(v){values.push(v);}interpolate(){return 1;}},timing(_v,config){timings.push(config);return {start(){},stop(){}};}}};
   throw Error(id);
  });
  PlayingCard({card:'As'});assert.equal(timings.length,0);
  PlayingCard({card:'As',motion:{id:'hole',startedAt:100,durationMs:360}});
  PlayingCard({card:'Ks',motion:{id:'board',startedAt:100,durationMs:540}});
  assert.deepEqual(timings.map(t=>t.duration),reduced?[]:[360,540]);
  PlayingCard({card:'Ks',motion:{id:'old',startedAt:-1000,durationMs:540}});
  assert.equal(timings.length,reduced?0:2);
 }
});
