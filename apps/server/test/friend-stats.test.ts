import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {FriendStatsStore} from '../src/FriendStatsStore.ts';
import {friendStatsApi} from '../src/friendStatsApi.ts';
import {createAppServer} from '../src/http.ts';
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',c='00000000-0000-0000-0000-000000000003';
test('shared-hand statistics survive restart and ignore replay; split and multiway pots count explicitly',()=>{
 const dir=mkdtempSync(join(tmpdir(),'boardgame-stats-')),path=join(dir,'stats.sqlite');let db=new FriendStatsStore(path);
 try{
   db.record('one',[{accountId:a,netChips:100,won:true},{accountId:b,netChips:-60,won:false},{accountId:c,netChips:-40,won:false}]);
   db.record('one',[{accountId:a,netChips:9999,won:true},{accountId:b,netChips:9999,won:true}]);
   db.record('split',[{accountId:a,netChips:0,won:true},{accountId:b,netChips:0,won:true}]);
   db.record('other',[{accountId:a,netChips:-50,won:false},{accountId:c,netChips:50,won:true}]);
   assert.deepEqual(db.compare(a,b),{hands:2,mine:{wins:2,netChips:100},friend:{wins:1,netChips:-60}});
   assert.equal(db.compare(a,c).hands,2);assert.equal(db.compare(b,c).hands,1);
   assert.equal(db.compare(a,'never-played').hands,0);
   assert.throws(()=>db.record('bad',[{accountId:a,netChips:1,won:true},{accountId:a,netChips:-1,won:false}]),/Invalid/);
   db.close();db=new FriendStatsStore(path);assert.equal(db.compare(a,b).hands,2);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('statistics HTTP requires current login and accepted friendship; errors never appear as zero results',async()=>{
 const db=new FriendStatsStore(':memory:');let accepted=true,offline=false;
 const original=globalThis.fetch;
 globalThis.fetch=async()=>{if(offline)throw Error('offline');return new Response(JSON.stringify(accepted?[{other_id:b,status:'accepted'}]:[]));};
 const server=createAppServer(()=>true,friendStatsApi(db,async token=>token==='valid'?{accountId:a,sessionId:'session'}:null,'https://test.supabase.co','sb_publishable_test'));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/friends/'+b+'/stats';
 try{
   assert.equal((await original(url)).status,401);
   let response=await original(url,{headers:{Authorization:'Bearer valid'}});assert.equal(response.status,200);assert.equal((await response.json()).hands,0);
   accepted=false;assert.equal((await original(url,{headers:{Authorization:'Bearer valid'}})).status,403);
   accepted=true;offline=true;assert.equal((await original(url,{headers:{Authorization:'Bearer valid'}})).status,503);
 }finally{globalThis.fetch=original;await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});

// Direct handler requests let us vary the socket peer without trusting a test header.
async function rateFixture(t:import('node:test').TestContext, trusted:string[]=[]) {
 const db=new FriendStatsStore(':memory:');t.after(()=>db.close());
 let checks=0,friendChecks=0;
 t.mock.method(globalThis,'fetch',async()=>{friendChecks++;return new Response(JSON.stringify([{other_id:c,status:'accepted'}]));});
 const handler=friendStatsApi(db,async token=>{
   checks++;
   if(token==='offline')throw Error('offline');
   if(token.startsWith('a-'))return {accountId:a,sessionId:token};
   if(token==='b')return {accountId:b,sessionId:'b'};
   return null;
 },'https://test.supabase.co','sb_publishable_test',trusted);
 return {
   checks:()=>checks,friendChecks:()=>friendChecks,
   async request(token?:string,remote='172.30.50.2',forwarded?:string|string[]) {
     let status=0,body:any;
     const request={url:'/friends/'+c+'/stats',method:'GET',socket:{remoteAddress:remote},headers:{authorization:token?'Bearer '+token:undefined,'x-forwarded-for':forwarded}};
     const response={writeHead(code:number){status=code;},end(text:string){body=JSON.parse(text);}};
     assert.equal(await handler(request as unknown as import('node:http').IncomingMessage,response as unknown as import('node:http').ServerResponse),true);
     return {status,body};
   },
 };
}

test('account quotas are independent behind one proxy; sessions, tokens and IPs cannot reset an account quota',async t=>{
 const f=await rateFixture(t,['172.30.50.2']);
 for(let i=0;i<30;i++)assert.equal((await f.request('a-'+i,'172.30.50.2','198.51.100.1')).status,200);
 assert.deepEqual(await f.request('a-new','203.0.113.1','198.51.100.99'),{status:429,body:{error:'RATE_LIMITED'}});
 for(let i=0;i<30;i++)assert.equal((await f.request('b','172.30.50.2','198.51.100.1')).status,200);
 assert.equal((await f.request('b')).status,429);
 assert.equal(f.friendChecks(),60);
});

test('anonymous requests are limited separately; rotating invalid tokens and spoofed headers cannot bypass an untrusted peer quota',async t=>{
 const f=await rateFixture(t,['172.30.50.2']);
 for(let i=0;i<30;i++)assert.equal((await f.request(i%2?'invalid-'+i:undefined,'203.0.113.9','198.51.100.'+i)).status,401);
 assert.deepEqual(await f.request('invalid-new','203.0.113.9','192.0.2.1'),{status:429,body:{error:'RATE_LIMITED'}});
 assert.equal((await f.request('a-1','203.0.113.9')).status,200);
 assert.equal((await f.request(undefined,'203.0.113.10')).status,401);
 assert.equal(f.friendChecks(),1);
});

test('trusted proxy uses rightmost untrusted hop, separating anonymous clients and ignoring forged leading hops',async t=>{
 const f=await rateFixture(t,['172.30.50.2']);
 for(let i=0;i<30;i++)assert.equal((await f.request(undefined,'::ffff:172.30.50.2',`192.0.2.${i}, 198.51.100.1`)).status,401);
 assert.equal((await f.request(undefined,'172.30.50.2','203.0.113.5, 198.51.100.1')).status,429);
 assert.equal((await f.request(undefined,'172.30.50.2','198.51.100.2')).status,401);
});

test('missing, malformed, oversized and array forwarding headers fall back to the proxy peer',async t=>{
 const f=await rateFixture(t,['172.30.50.2']);
 const headers=[undefined,'not-an-ip','1'.repeat(1025),['198.51.100.1'],'198.51.100.1, bad'];
 for(let i=0;i<30;i++)assert.equal((await f.request(undefined,'172.30.50.2',headers[i%headers.length])).status,401);
 for(const header of headers)assert.equal((await f.request(undefined,'172.30.50.2',header)).status,429);
});

test('proxy trust defaults to none',async t=>{
 const f=await rateFixture(t);
 for(let i=0;i<30;i++)assert.equal((await f.request(undefined,'172.30.50.2','198.51.100.'+i)).status,401);
 assert.equal((await f.request(undefined,'172.30.50.2','203.0.113.1')).status,429);
});

test('account and anonymous windows reset at 60 seconds, and rejected requests do not extend them',async t=>{
 let now=100000;t.mock.method(Date,'now',()=>now);
 const f=await rateFixture(t);
 for(let i=0;i<30;i++){assert.equal((await f.request('a-1')).status,200);assert.equal((await f.request()).status,401);}
 now+=59999;
 assert.equal((await f.request('a-2')).status,429);assert.equal((await f.request()).status,429);
 now++;
 assert.equal((await f.request('a-3')).status,200);assert.equal((await f.request()).status,401);
});

test('anonymous storage is bounded, does not evict active quotas, and reclaims expired entries',async t=>{
 let now=100000;t.mock.method(Date,'now',()=>now);
 const f=await rateFixture(t);
 for(let i=0;i<4096;i++)assert.equal((await f.request(undefined,`198.18.${Math.floor(i/256)}.${i%256}`)).status,401);
 assert.equal((await f.request(undefined,'203.0.113.1')).status,429);
 assert.equal((await f.request(undefined,'198.18.0.0')).status,401);
 assert.equal((await f.request('a-1','203.0.113.1')).status,200);
 now+=60000;
 assert.equal((await f.request(undefined,'203.0.113.1')).status,401);
});

test('authentication outages consume only anonymous quota and never permit statistics access',async t=>{
 const f=await rateFixture(t);
 for(let i=0;i<30;i++)assert.equal((await f.request('offline')).status,503);
 assert.deepEqual(await f.request('offline'),{status:429,body:{error:'RATE_LIMITED'}});
 assert.equal(f.friendChecks(),0);
 assert.equal((await f.request('b')).status,200);
});

test('concurrent requests cannot exceed the account quota',async t=>{
 const f=await rateFixture(t);
 const results=await Promise.all(Array.from({length:50},(_,i)=>f.request('a-'+i)));
 assert.equal(results.filter(r=>r.status===200).length,30);
 assert.equal(results.filter(r=>r.status===429).length,20);
 assert.equal(f.friendChecks(),30);
});
