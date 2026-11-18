// Local real-component fixture. No production authentication, databases or deployments.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.qa-web/p2-browser');
const {build}=require(path.join(root,'.qa-web/node_modules/esbuild'));
const {chromium}=require(path.join(root,'.qa-web/node_modules/playwright'));
const {WebSocketServer}=require(require.resolve('ws',{paths:[path.join(root,'apps/server')]}));
const {execFileSync}=require('node:child_process');
const ids=['00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003'];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 for(const variant of ['before','after']){
  await build({entryPoints:[path.join(root,'apps/mobile/test/browser/p2-fixture.jsx')],bundle:true,outfile:path.join(out,variant+'.js'),plugins:[{name:'local-fixtures',setup(b){
   if(variant==='before')b.onLoad({filter:/(CardArtwork|LobbyScreen)\.tsx$/},args=>({contents:execFileSync('git',['show','89229f5:'+path.relative(root,args.path).replaceAll('\\','/')],{cwd:root,encoding:'utf8'}),loader:'tsx',resolveDir:path.dirname(args.path)}));
   b.onResolve({filter:/\/(useFriends|authClient|serverUrl)$/},args=>({path:args.path.split('/').pop(),namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},({path:p})=>({contents:p==='useFriends'?`export const useFriends=()=>({rows:${JSON.stringify(ids.map((id,i)=>({id:'relation'+i,other_id:id,display_name:'동일 이름',status:'accepted'})))},busy:false,loading:false,refresh(){},request:code=>window.actions.push(code)});`:p==='authClient'?"export const authClient={auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}};":"export const getServerUrl=()=>location.origin;",loader:'js'}));
  }}],platform:'browser',format:'iife',jsx:'automatic',define:{__DEV__:'false','process.env.NODE_ENV':'"development"'},resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.jsx','.js','.json'],alias:{'@react-native/assets-registry/registry':path.join(root,'node_modules/react-native-web/dist/modules/AssetRegistry/index.js'),'react-native':path.join(root,'apps/mobile/test/browser/native-web-shim.js'),'react-native-svg':path.join(root,'node_modules/react-native-svg/src/ReactNativeSVG.web.ts')},loader:{'.png':'dataurl','.wav':'dataurl'}});
 }
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');if(u.pathname==='/before.js'||u.pathname==='/after.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,u.pathname.slice(1))));}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/'+(u.searchParams.get('variant')==='before'?'before':'after')+'.js"></script>');}});
 const sockets=new WebSocketServer({server,path:'/snapshots'});sockets.on('connection',socket=>socket.send(JSON.stringify({revision:1})));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;const report=[];
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});const base=`http://127.0.0.1:${server.address().port}`;
  for(const [width,height] of [[1366,768],[1920,1080],[375,812],[390,844],[430,932],[844,390]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<900,hasTouch:width<900});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   for(const variant of ['before','after']){
    await page.goto(`${base}?screen=lobby&variant=${variant}`);
    const settings=page.getByRole('button',{name:/방 설정 변경/});await settings.scrollIntoViewIfNeeded();const box=await settings.boundingBox();assert.ok(box.width>=44&&box.height>=44);
    await page.waitForTimeout(150);await settings.scrollIntoViewIfNeeded();await page.waitForTimeout(150);await page.screenshot({path:path.join(out,`${variant}-${width}-settings.png`)});
    await settings.click();await page.getByRole('textbox',{name:'시작 칩',exact:true}).waitFor();await page.getByRole('button',{name:'취소 ✕'}).click();assert.equal(await page.getByRole('textbox',{name:'시작 칩',exact:true}).count(),0);
    await page.goto(`${base}?variant=${variant}&count=6&showdown=1`);await page.waitForTimeout(200);
    await page.screenshot({path:path.join(out,`${variant}-${width}-cards.png`)});
   }
   for(let count=2;count<=6;count++){
    await page.goto(`${base}?count=${count}`);await page.waitForTimeout(100);assert.equal(await page.getByLabel('비공개 카드',{exact:true}).count(),(count-1)*2);
    if(count===6)await page.screenshot({path:path.join(out,`after-${width}-private.png`)});
    await page.goto(`${base}?count=${count}&showdown=1`);await page.waitForTimeout(100);
    const cards=await page.locator('[aria-label$="스페이드"],[aria-label$="하트"],[aria-label$="다이아"],[aria-label$="클로버"]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
    assert.ok(cards.length>=count*2+5);
    for(const r of cards)assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.w<=width+1&&r.y+r.h<=height+1,JSON.stringify({width,height,count,r}));
    for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){const a=cards[i],b=cards[j];assert.ok(Math.min(a.x+a.w,b.x+b.w)<=Math.max(a.x,b.x)+1||Math.min(a.y+a.h,b.y+b.h)<=Math.max(a.y,b.y)+1,'overlapping cards');}
    await page.getByRole('button',{name:'핸드 히스토리 열기'}).click();assert.equal(await page.getByTestId('web-review').isVisible(),true);
    if(count===6)await page.screenshot({path:path.join(out,`after-${width}-history.png`)});
    await page.getByRole('button',{name:'히스토리 닫기'}).click();
   }
   await page.goto(`${base}?screen=lobby&guest=1`);assert.equal(await page.getByRole('button',{name:/방 설정 변경/}).count(),0);
   await page.goto(`${base}?screen=lobby&offline=1`);assert.equal(await page.getByRole('button',{name:/방 설정 변경/}).isDisabled(),true);
   let status=200,hands=3;const requests=[];
   await page.route('**/friends/**/stats',route=>{requests.push(route.request().url());return route.fulfill({status,contentType:'application/json',body:JSON.stringify({hands,mine:{wins:2,netChips:40},friend:{wins:1,netChips:-20}})});});
   await page.goto(`${base}?screen=friends`);await page.getByRole('button',{name:'상대 전적 비교',exact:true}).click();
   await page.screenshot({path:path.join(out,`after-${width}-selection.png`)});
   await page.getByRole('button',{name:'동일 이름 · 친구 1',exact:true}).click();await page.getByRole('button',{name:'동일 이름 · 친구 2 전적 보기',exact:true}).click();await page.getByText('3판',{exact:true}).waitFor();assert.ok(requests.at(-1).endsWith(`/friends/${ids[0]}/${ids[1]}/stats`));
   await page.screenshot({path:path.join(out,`after-${width}-stats.png`)});
   await page.getByRole('button',{name:'새로고침',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`after-${width}-stats-bottom.png`)});
   status=403;await page.getByRole('button',{name:'새로고침',exact:true}).click();await page.getByRole('alert').waitFor({state:'attached'});await page.getByRole('alert').scrollIntoViewIfNeeded();assert.equal(await page.getByText('3판',{exact:true}).count(),0);
   status=200;hands=0;await page.getByRole('button',{name:'다시 시도',exact:true}).click();await page.getByText('0판',{exact:true}).waitFor();
   await page.getByRole('button',{name:'‹ 친구 목록'}).click();await page.getByRole('button',{name:'테스터 (나) 전적 보기'}).click();await page.getByText('0판',{exact:true}).waitFor();assert.ok(requests.at(-1).endsWith(`/friends/${ids[0]}/stats`));
   assert.deepEqual(errors,[]);report.push({width,height,players:'2–6',settings:'host/guest/offline/modal',stats:'pair/self/403/empty',result:'PASS'});await context.close();
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({browser:browser.version(),report},null,2));console.log(JSON.stringify(report));
 }finally{await browser?.close();for(const s of sockets.clients)s.terminate();sockets.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
