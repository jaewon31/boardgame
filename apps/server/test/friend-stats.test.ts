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
