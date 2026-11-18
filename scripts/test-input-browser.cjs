// Test-only bundle: real screen components, synthetic room snapshots, no external services.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const {build}=require(path.join(root,'.qa-web/node_modules/esbuild'));
const {WebSocketServer}=require(require.resolve('ws',{paths:[path.join(root,'apps/server')]}));
const {chromium}=require(path.join(root,'.qa-web/node_modules/playwright'));
(async()=>{
 const out=path.join(root,'.qa-web/input-browser');fs.mkdirSync(out,{recursive:true});
 await build({entryPoints:[path.join(root,'apps/mobile/test/browser/input-fixture.jsx')],bundle:true,outfile:path.join(out,'bundle.js'),plugins:[{name:'offline-friends',setup(b){b.onResolve({filter:/\/useFriends$/},()=>({path:'friends',namespace:'fixture'}));b.onResolve({filter:/\/FriendStatsScreen$/},()=>({path:'stats',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},({path:p})=>({contents:p==='friends'?'export const useFriends=()=>({rows:[],busy:false,loading:false,request:code=>window.actions.push(code)});':'export const FriendStatsScreen=()=>null;',loader:'js'}));}}],platform:'browser',format:'iife',jsx:'automatic',define:{__DEV__:'false','process.env.NODE_ENV':'"development"'},resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.jsx','.js','.json'],alias:{'@react-native/assets-registry/registry':path.join(root,'node_modules/react-native-web/dist/modules/AssetRegistry/index.js'),'react-native':path.join(root,'apps/mobile/test/browser/native-web-shim.js'),'react-native-svg':path.join(root,'node_modules/react-native-svg/src/ReactNativeSVG.web.ts')},loader:{'.png':'dataurl','.wav':'dataurl'}});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url.startsWith('/bundle.js')?'text/javascript':'text/html');res.end(req.url.startsWith('/bundle.js')?fs.readFileSync(path.join(out,'bundle.js')):'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/bundle.js"></script>');});
 const sockets=new WebSocketServer({server,path:'/snapshots'});sockets.on('connection',socket=>{let revision=0;const timer=setInterval(()=>{if(socket.readyState===1)socket.send(JSON.stringify({revision:++revision}));},100);socket.on('close',()=>clearInterval(timer));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const url=`http://127.0.0.1:${server.address().port}`,page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'?screen=account');const name=page.getByRole('textbox',{name:'계정 닉네임'});
 await name.fill('');await name.pressSequentially('Ab12');await name.press('Backspace');assert.equal(await name.inputValue(),'Ab1');
 await name.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));});
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.imeSetComposition',{text:'ㅎ',selectionStart:1,selectionEnd:1});
 await cdp.send('Input.imeSetComposition',{text:'한',selectionStart:1,selectionEnd:1});
 await name.dispatchEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true});
 assert.equal(await page.evaluate(()=>actions.length),0);
 await cdp.send('Input.insertText',{text:'한글'});
 await name.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'한글'})));
 assert.equal(await name.inputValue(),'Ab1한글');
 await page.evaluate(()=>fixture.setLoading(true));await page.waitForTimeout(250);assert.equal(await name.evaluate(el=>el===document.activeElement),true);assert.equal(await name.inputValue(),'Ab1한글');
 await name.press('Enter');assert.deepEqual(await page.evaluate(()=>actions),['Ab1한글']);
 await page.goto(url+'?screen=home');await page.getByRole('textbox',{name:'닉네임',exact:true}).fill('테스터');await page.getByRole('tab',{name:'코드로 입장'}).click();const code=page.getByRole('textbox',{name:'초대 코드'});await code.fill('abcd2345');await code.press('Enter');assert.equal(await page.evaluate(()=>actions[0].code),'ABCD2345');
 await page.goto(url+'?screen=friends');await page.getByRole('button',{name:'＋ 추가'}).click();const friend=page.getByRole('textbox',{name:'친구 코드'});await friend.fill('abcdef123456');await friend.press('Enter');assert.deepEqual(await page.evaluate(()=>actions),['ABCDEF123456']);
 await page.goto(url+'?screen=settings');for(const [label,value] of [['시작 칩','1000'],['스몰 블라인드','10'],['빅 블라인드','20'],['차례당 제한 시간','30']]){const input=page.getByRole('textbox',{name:label,exact:true});await input.fill(value);await input.press('Enter');}assert.equal(await page.evaluate(()=>actions[0].bigBlind),20);
 await page.goto(url);await page.getByRole('button',{name:'레이즈 금액 선택'}).click();const amount=page.getByRole('textbox',{name:'레이즈 총 금액'});await amount.fill('120');await page.waitForTimeout(1250);assert.equal(await amount.inputValue(),'120');assert.equal(await amount.evaluate(el=>el===document.activeElement),true);await amount.press('Backspace');assert.equal(await amount.inputValue(),'12');await amount.press('Enter');assert.equal(await amount.isVisible(),true);assert.equal(await page.evaluate(()=>actions.length),0);await amount.fill('140');await amount.press('Enter');assert.deepEqual(await page.evaluate(()=>actions),[['raise',140]]);
 await page.screenshot({path:path.join(out,'desktop.png')});
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
 const context=await browser.newContext({viewport,isMobile:true,hasTouch:true});const mobile=await context.newPage();
 await mobile.addInitScript(()=>{const vv=window.visualViewport;let height=innerHeight,layoutHeight=innerHeight,top=0;Object.defineProperty(window,'innerHeight',{get:()=>layoutHeight});Object.defineProperties(vv,{height:{get:()=>height},offsetTop:{get:()=>top}});window.keyboardViewport=(h,t=0,resizeLayout=false)=>{height=h;top=t;if(resizeLayout){layoutHeight=h;window.dispatchEvent(new Event('resize'));}vv.dispatchEvent(new Event('resize'));vv.dispatchEvent(new Event('scroll'));};});
 await mobile.goto(url);const table=mobile.getByTestId('web-game-table');const before=await table.boundingBox();
 await mobile.getByRole('button',{name:'핸드 히스토리 열기'}).click();assert.equal(await mobile.getByTestId('web-review').isVisible(),true);assert.deepEqual(await table.boundingBox(),before);await mobile.getByRole('button',{name:'히스토리 닫기'}).click();
 await mobile.getByRole('button',{name:'레이즈 금액 선택'}).click();const input=mobile.getByRole('textbox',{name:'레이즈 총 금액'});await input.fill('120');
 const height=Math.round(viewport.height*.55);await mobile.evaluate(h=>keyboardViewport(h),height);await mobile.waitForTimeout(250);
 assert.deepEqual(await table.boundingBox(),before);const field=await input.boundingBox();assert.ok(field.y>=0 && field.y+field.height<=height,JSON.stringify({field,height}));assert.equal(await input.evaluate(el=>el===document.activeElement),true);
 await mobile.evaluate(h=>keyboardViewport(h,0,true),height);await mobile.waitForTimeout(100);assert.deepEqual(await table.boundingBox(),before);
 await mobile.screenshot({path:path.join(out,viewport.width===390?'mobile-portrait.png':'mobile-landscape.png')});
 await input.blur();await mobile.evaluate(h=>keyboardViewport(h,0,true),viewport.height);await mobile.getByRole('button',{name:'닫기 ✕',exact:true}).click();await mobile.waitForTimeout(250);assert.deepEqual(await table.boundingBox(),before);
 await context.close();
 }
 assert.deepEqual(errors,[]);console.log('Chrome '+browser.version());console.log('PASS: Chrome IME composition, English/numbers, Backspace/Enter, profile refresh, room settings, live revision focus, history overlay, portrait/landscape simulated keyboard geometry.');
 }finally{await browser?.close();for(const socket of sockets.clients)socket.terminate();sockets.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
