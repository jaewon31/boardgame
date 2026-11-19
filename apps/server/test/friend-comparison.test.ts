import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {FriendStatsStore} from '../src/FriendStatsStore.ts';
import {friendStatsApi} from '../src/friendStatsApi.ts';
import {createAppServer} from '../src/http.ts';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
const [a,b,c,d]=[1,2,3,4].map(n=>`00000000-0000-0000-0000-00000000000${n}`);

test('comparison HTTP + real permission SQL: all three accepted edges, revocation, deletion, spoofing and fail closed',async t=>{
 const pg=new PGlite(),stats=new FriendStatsStore(':memory:');
 const realFetch=globalThis.fetch;
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,created_at timestamptz not null);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('role','authenticated','session_id',current_setting('request.jwt.claim.sub',true))$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 for(const file of ['migrations/001_accounts.sql','migrations/002_friends.sql','migrations/003_single_session.sql','migrations/004_anonymous_onboarding.sql','migrations/005_repair_account_session.sql','migrations/006_readonly_session_policies.sql','drafts/007_friend_stats_permission.sql','drafts/007_friend_stats_permission.sql'])await pg.exec(readFileSync(new URL('../../../supabase/'+file,import.meta.url),'utf8'));
 await pg.query('insert into auth.users(id) values ($1),($2),($3),($4)',[a,b,c,d]);
 await pg.exec('insert into auth.sessions select id,id,now() from auth.users;insert into public.account_sessions select id,id,now() from auth.users');
 // Duplicate nicknames cannot select a different account.
 await pg.exec("update public.profiles set display_name='동일 이름'");
 stats.record('shared',[{accountId:b,won:true,netChips:25},{accountId:c,won:false,netChips:-25}]);
 let offline=false,malformed=false;
 t.mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>{
   if(offline)return new Response('{}',{status:404});
   if(malformed)return new Response('"true"');
   assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer valid');
   await pg.exec('reset role');await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);await pg.exec('set role authenticated');
   if(String(input).endsWith('/list_friends'))return new Response(JSON.stringify((await pg.query('select * from public.list_friends()')).rows));
   const args=JSON.parse(String(init?.body));assert.deepEqual(Object.keys(args).sort(),['first_id','second_id']);
   const result=await pg.query<{allowed:boolean}>('select public.can_compare_friend_stats($1,$2) allowed',[args.first_id,args.second_id]);
   return new Response(JSON.stringify(result.rows[0].allowed));
 });
 const server=createAppServer(()=>true,friendStatsApi(stats,async token=>token==='valid'?{accountId:a,sessionId:'session'}:null,'https://local.test','sb_publishable_test'),['http://localhost:1234']);
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const get=(path=`/friends/${b}/${c}/stats`,token='valid')=>realFetch(base+path,{headers:{Authorization:'Bearer '+token}});
 const edges=[[a,b],[a,c],[b,c]];
 async function setup(states:(string|null)[]){
   await pg.exec('reset role;delete from public.friendships');
   for(let i=0;i<3;i++)if(states[i])await pg.query('insert into public.friendships(requester,recipient,status) values($1,$2,$3)',[...edges[i],states[i]]);
 }
 try{
   await setup(['accepted',null,null]);
   assert.equal((await get(`/friends/${b}/stats`)).status,200,'A and accepted friend B');
   assert.equal((await get(`/friends/${c}/stats`)).status,403,'A and non-friend C on existing API');
   assert.equal((await get(`/friends/${a}/${c}/stats`)).status,403,'A and non-friend C on pair API');
   for(const states of [['accepted',null,null],[null,'accepted',null],['accepted','accepted',null],['pending','accepted','accepted'],['accepted','pending','accepted'],['accepted','accepted','pending']]){
     await setup(states);assert.equal((await get()).status,403,JSON.stringify(states));
   }
   await setup(['accepted','accepted','accepted']);
   let response=await get();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
   assert.deepEqual(await response.json(),{hands:1,mine:{wins:1,netChips:25},friend:{wins:0,netChips:-25}});
   response=await get(`/friends/${c}/${b}/stats`);assert.equal((await response.json()).friend.netChips,25);
   assert.equal((await get(`/friends/${b}/stats`)).status,200);
   assert.equal((await get(`/friends/${a}/${b}/stats`)).status,200);
   assert.equal((await get(`/friends/${b}/${d}/stats`)).status,403);
   assert.equal((await get(`/friends/${b}/${b}/stats`)).status,400);
   assert.equal((await get(undefined,'forged')).status,401);
   assert.equal((await get(`/friends/${b}/${c}/stats?accountId=${b}`)).status,404);
   response=await realFetch(base+`/friends/${b}/${c}/stats`,{method:'OPTIONS',headers:{Origin:'http://localhost:1234','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}});assert.equal(response.status,204);
   for(let i=0;i<3;i++){const states:(string|null)[]=['accepted','accepted','accepted'];states[i]=null;await setup(states);assert.equal((await get()).status,403);}
   await setup(['accepted','accepted','accepted']);
   malformed=true;assert.equal((await get()).status,403);malformed=false;
   offline=true;assert.equal((await get()).status,503);offline=false;
   await pg.exec('reset role');await pg.query('delete from auth.users where id=$1',[c]);assert.equal((await get()).status,403);
   await pg.exec('reset role;set role anon');await assert.rejects(pg.query('select public.can_compare_friend_stats($1,$2)',[a,b]),/permission denied/);
   await pg.exec('reset role');await pg.query("select set_config('request.jwt.claim.sub','',false)");await pg.exec('set role authenticated');
   assert.equal((await pg.query<{allowed:boolean}>('select public.can_compare_friend_stats($1,$2) allowed',[a,b])).rows[0].allowed,false);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));stats.close();await pg.close();}
});
