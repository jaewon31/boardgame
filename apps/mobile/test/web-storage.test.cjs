const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const dir=path.resolve(__dirname,'../src/services');
function load(name,stubs={},globals={}) {
  const file=path.join(dir,name+'.ts'), exports={};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,URL,console,...globals,require(id){
    if(Object.hasOwn(stubs,id))return stubs[id];
    if(id.startsWith('./'))return load(id.slice(2).replace(/\.ts$/,''),stubs,globals);
    return require(id);
  }},{filename:file});
  return exports;
}
function memory(){const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
const {browserStorage,validBrowserAuth,validBrowserSettings}=load('browserStorage');
const id='11111111-1111-4111-8111-111111111111';
const session={access_token:'test-only-access',refresh_token:'test-only-refresh',expires_at:4102444800,user:{id}};
const key='sb-test-auth-token';

test('web auth persists across adapter instances, removes only the requested session, retains identity marker',async()=>{
  const mem=memory(),a=browserStorage(()=>mem,'auth.',validBrowserAuth);
  await a.prepare();assert.equal(mem.data.size,0);
  await a.setItem(key,JSON.stringify(session));await a.setItem('friends-table-account-id',id);
  const b=browserStorage(()=>mem,'auth.',validBrowserAuth);
  assert.deepEqual(JSON.parse(await b.getItem(key)),session);
  await b.removeItem(key);assert.equal(await a.getItem(key),null);
  assert.equal(await a.getItem('friends-table-account-id'),id);
});
test('denied access, read-only storage and quota failures reject with redacted errors',async()=>{
  for(const resolve of [()=>{throw Error('sensitive detail');},()=>({getItem:()=>null,setItem(){throw Error('quota secret');},removeItem(){}})]){
    const a=browserStorage(resolve,'auth.',validBrowserAuth);
    await assert.rejects(a.prepare(),e=>e.code==='browser_storage_unavailable'&&!e.message.includes('secret'));
    await assert.rejects(a.setItem(key,JSON.stringify(session)));
  }
  const a=browserStorage(()=>{throw Error('denied');},'auth.',validBrowserAuth);
  await assert.rejects(a.getItem(key));await assert.rejects(a.removeItem(key));
});
test('malformed stored sessions are preserved and rejected, never treated as a new installation',async()=>{
  const mem=memory(),a=browserStorage(()=>mem,'auth.',validBrowserAuth);
  for(const text of ['null','[]','{broken',JSON.stringify({...session,user:{id:'wrong'}}),JSON.stringify({...session,expires_at:'tomorrow'})]){
    mem.setItem('auth.'+key,text);await assert.rejects(a.getItem(key));assert.equal(mem.getItem('auth.'+key),text);
  }
  await assert.rejects(a.setItem('friends-table-account-id','invalid'));
});
test('settings validate volume, mute and gains independently of auth',async()=>{
  const mem=memory(),a=browserStorage(()=>mem,'settings.',validBrowserSettings);
  const settings=JSON.stringify({level:.4,muted:true,gains:{check:.3}});
  await a.setItem('table-audio',settings);assert.equal(await a.getItem('table-audio'),settings);
  for(const value of [{level:2,muted:true,gains:{}},{level:.5,muted:'false',gains:{}},{level:.5,muted:false,gains:{check:-1}}])await assert.rejects(a.setItem('table-audio',JSON.stringify(value)));
  await a.removeItem('table-audio');assert.equal(await a.getItem('table-audio'),null);
});
test('platform entry points select browser storage without importing SecureStore; web room tokens are not retained',async()=>{
  const mem=memory(),globals={window:{localStorage:mem}};
  const a=load('accountStorage.web',{},globals);await a.prepareAccountStorage();
  await a.accountStorage.setItem(key,JSON.stringify(session));assert.equal(mem.data.size,1);
  const settings=load('settingsStorage.web',{},globals);await settings.setItemAsync('table-audio',JSON.stringify({level:.5,muted:false,gains:{}}));
  const room=load('sessionStore.web').createSessionStore('ws://localhost:3000/lobby');
  await room.save({code:'ABCD2345',token:'a'.repeat(64)});assert.equal(await room.load(),null);assert.equal(mem.data.size,2);
});
test('native adapters retain chunked auth keys and device-only room credential options',async()=>{
  const mem=memory(),options=[];
  const secure={getItemAsync:async k=>mem.getItem(k),setItemAsync:async(k,v,o)=>{mem.setItem(k,v);options.push(o);},deleteItemAsync:async k=>mem.removeItem(k),WHEN_UNLOCKED_THIS_DEVICE_ONLY:7};
  const a=load('accountStorage',{'expo-secure-store':secure});await a.prepareAccountStorage();
  await a.accountStorage.setItem(key,'a'.repeat(4000));assert.equal(await a.accountStorage.getItem(key),'a'.repeat(4000));assert.ok(mem.data.has('auth.'+key));
  const room=load('sessionStore',{'expo-secure-store':secure}).createSessionStore('ws://localhost:3000/lobby');
  await room.save({code:'ABCD2345',token:'a'.repeat(64)});assert.equal((await room.load()).code,'ABCD2345');assert.equal(options.at(-1).keychainAccessible,7);
  await room.save(null);assert.equal(await room.load(),null);
  const settings=load('settingsStorage',{'expo-secure-store':secure});await settings.setItemAsync('table-audio','native');assert.equal(mem.getItem('table-audio'),'native');
});
test('actual Supabase SDK restores a stored session and sign-out removes tokens without losing the identity guard',async()=>{
  const {createClient}=require('@supabase/supabase-js');
  const mem=memory(),storage=browserStorage(()=>mem,'auth.',validBrowserAuth);
  await storage.setItem(key,JSON.stringify(session));await storage.setItem('friends-table-account-id',id);
  const client=createClient('https://test.supabase.co','sb_publishable_test',{auth:{storage,storageKey:key,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async()=>new Response('{}',{status:200})}});
  assert.equal((await client.auth.getSession()).data.session.user.id,id);
  assert.equal((await client.auth.signOut({scope:'local'})).error,null);
  assert.equal(await storage.getItem(key),null);assert.equal(await storage.getItem('friends-table-account-id'),id);
  const {ensureAccountSession}=load('anonymousSession');
  await assert.rejects(ensureAccountSession(client.auth,storage),e=>e.code==='saved_account_unavailable');
});
test('actual Supabase anonymous sign-in persists and a new client restores without another sign-up',async()=>{
  const {createClient}=require('@supabase/supabase-js'),{ensureAccountSession}=load('anonymousSession');
  const mem=memory(),storage=browserStorage(()=>mem,'auth.',validBrowserAuth);let requests=0;
  const options={auth:{storage,storageKey:key,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async()=>{requests++;return new Response(JSON.stringify({...session,expires_in:3600,token_type:'bearer'}),{status:200,headers:{'Content-Type':'application/json'}});}}};
  const first=createClient('https://test.supabase.co','sb_publishable_test',options);
  assert.equal((await ensureAccountSession(first.auth,storage)).user.id,id);assert.equal(requests,1);
  const second=createClient('https://test.supabase.co','sb_publishable_test',options);
  assert.equal((await ensureAccountSession(second.auth,storage)).user.id,id);assert.equal(requests,1);
});
test('web endpoints preserve native configuration, map emulator alias only in dev and reject mixed content',()=>{
  const {webEndpoint}=load('webEndpoint'),http={protocol:'http:',hostname:'localhost'},https={protocol:'https:',hostname:'app.test.com'};
  assert.equal(webEndpoint(undefined,true,http),'ws://localhost:3000/lobby');
  assert.equal(webEndpoint('ws://10.0.2.2:4000/lobby',true,http),'ws://localhost:4000/lobby');
  assert.equal(webEndpoint('ws://10.0.2.2:4000/lobby',true,{...http,hostname:'192.168.0.20'}),'ws://192.168.0.20:4000/lobby');
  assert.equal(webEndpoint('ws://localhost:3000/lobby',true,https),'');
  assert.equal(webEndpoint(undefined,false,https),'');
  assert.equal(webEndpoint('wss://game.test.com/lobby',false,https),'wss://game.test.com/lobby');
  assert.equal(webEndpoint('wss://game.test.com/lobby?token=secret',false,https),'');
  assert.equal(webEndpoint(undefined,true,{protocol:'http:',hostname:'[::1]'}),'ws://[::1]:3000/lobby');
});
test('Supabase refresh rotates persisted credentials through the web adapter',async()=>{
  const {createClient}=require('@supabase/supabase-js');
  const mem=memory(),storage=browserStorage(()=>mem,'auth.',validBrowserAuth);
  await storage.setItem(key,JSON.stringify({...session,expires_at:1}));
  let requests=0;
  const client=createClient('https://test.supabase.co','sb_publishable_test',{auth:{storage,storageKey:key,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async()=>{requests++;return new Response(JSON.stringify({...session,access_token:'rotated-test-access',refresh_token:'rotated-test-refresh',expires_in:3600,token_type:'bearer'}),{status:200,headers:{'Content-Type':'application/json'}});}}});
  const restored=await client.auth.getSession();
  assert.equal(restored.error,null);assert.equal(restored.data.session.user.id,id);assert.equal(requests,1);
  assert.equal(JSON.parse(await storage.getItem(key)).refresh_token,'rotated-test-refresh');
});
