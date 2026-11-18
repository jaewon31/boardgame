import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {FriendStatsStore} from '../src/FriendStatsStore.ts';
import {friendStatsApi} from '../src/friendStatsApi.ts';
import {accountAuthorizer} from '../src/accountSession.ts';
import {createAppServer} from '../src/http.ts';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
const [a,b,c,d]=[1,2,3,4].map(n=>`00000000-0000-0000-0000-00000000000${n}`);
const session='10000000-0000-0000-0000-000000000001';
const draft=readFileSync(new URL('../../../supabase/drafts/007_friend_stats_permission.sql',import.meta.url),'utf8');

test('RPC catalog, JWT identity, direct-call session enforcement and preserved RLS with migrations 001–006',async()=>{
 const db=new PGlite();
 try{
  // PostgREST's verified-claims GUC is simulated here, not a JWT signature verifier.
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role unexpected;
    create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,created_at timestamptz not null);
    create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to service_role;`);
  for(const file of ['001_accounts','002_friends','003_single_session','004_anonymous_onboarding','005_repair_account_session','006_readonly_session_policies'])await db.exec(readFileSync(new URL('../../../supabase/migrations/'+file+'.sql',import.meta.url),'utf8'));
  const policies=await db.query("select * from pg_policies where schemaname='public' order by tablename,policyname");
  await db.exec(draft);await db.exec(draft);
  await db.exec(readFileSync(new URL('../../../supabase/drafts/007_friend_stats_preflight_readonly.sql',import.meta.url),'utf8'));
  assert.deepEqual(await db.query("select * from pg_policies where schemaname='public' order by tablename,policyname"),policies);
  const columns=await db.query("select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='friendships' and column_name in ('requester','recipient','status') order by column_name");
  assert.deepEqual(columns.rows,[{column_name:'recipient',data_type:'uuid',is_nullable:'NO'},{column_name:'requester',data_type:'uuid',is_nullable:'NO'},{column_name:'status',data_type:'text',is_nullable:'NO'}]);
  const meta=(await db.query<{owner:string;prosecdef:boolean;provolatile:string;proconfig:string[]}>("select pg_get_userbyid(proowner) owner,prosecdef,provolatile,proconfig from pg_proc where oid='public.can_compare_friend_stats(uuid,uuid)'::regprocedure")).rows[0];
  assert.equal(meta.owner,'postgres');assert.equal(meta.prosecdef,true);assert.equal(meta.provolatile,'s');assert.deepEqual(meta.proconfig,['search_path=""']);
  for(const role of ['anon','service_role','unexpected','authenticated'])assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege($1,'public.can_compare_friend_stats(uuid,uuid)','EXECUTE') allowed",[role])).rows[0].allowed,role==='authenticated');
  await db.query('insert into auth.users(id) values($1),($2),($3),($4)',[a,b,c,d]);
  await db.query("insert into auth.sessions values($1,$2,'2026-01-01')",[session,a]);
  await db.query("insert into public.account_sessions values($1,$2,'2026-01-01')",[a,session]);
  await db.query("insert into public.friendships(requester,recipient,status) values($1,$2,'accepted'),($3,$1,'accepted'),($3,$2,'accepted')",[a,b,c]);
  async function as(uid:string|null,sid:string|null=session,role='authenticated'){
   await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,session_id:sid,role})]);
   await db.exec('set role '+(role==='service_role'?'service_role':'authenticated'));
  }
  const allowed=async(first:string|null=b,second:string|null=c)=>(await db.query<{ok:boolean}>('select public.can_compare_friend_stats($1,$2) ok',[first,second])).rows[0].ok;
  await as(a);assert.equal(await allowed(),true);assert.equal(await allowed(c,b),true);
  assert.equal(await allowed(a,b),true);assert.equal(await allowed(b,a),true);
  assert.equal(await allowed(a,a),false);assert.equal(await allowed(null,c),false);
  // A can compare B/C, but still cannot SELECT their relationship or profiles.
  assert.equal((await db.query('select * from public.friendships')).rows.length,2);
  assert.equal((await db.query('select * from public.profiles')).rows.length,1);
  await assert.rejects(db.query("update public.friendships set status='accepted'"),/permission denied/);
  await as(d);assert.equal(await allowed(),false);
  await as(null,null);assert.equal(await allowed(),false);
  await as(a,null);assert.equal(await allowed(),false);
  await as(a,session,'service_role');await assert.rejects(allowed(),/permission denied/);
  // Even accidental EXECUTE on this RPC cannot make a service JWT a user JWT.
  await db.exec('reset role;grant execute on function public.can_compare_friend_stats(uuid,uuid) to service_role');
  await as(a,session,'service_role');assert.equal(await allowed(),false);
  await db.exec('reset role');await db.exec(draft);
  const newer='10000000-0000-0000-0000-000000000002';
  await db.query("insert into auth.sessions values($1,$2,'2026-01-02')",[newer,a]);
  await as(a);assert.equal(await allowed(),false); // no need for a newer request to invalidate the old login
  await as(a,newer);assert.equal(await allowed(),false); // authorizer has not registered the latest session
  assert.equal((await db.query<{id:string}>('select public.current_account_session() id')).rows[0].id,a);
  assert.equal(await allowed(),true);
  await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[newer]);
  await as(a,newer);assert.equal(await allowed(),false);await as(a);assert.equal(await allowed(),false);
  await db.exec('reset role;grant execute on function public.can_compare_friend_stats(uuid,uuid) to unexpected');
  await assert.rejects(db.exec(draft),/Unexpected friend stats RPC ACL/);await db.exec('rollback');
  await db.exec('revoke all on function public.can_compare_friend_stats(uuid,uuid) from unexpected');
  await db.exec('grant execute on function public.can_compare_friend_stats(uuid,uuid) to authenticated with grant option');
  await assert.rejects(db.exec(draft),/Unexpected friend stats RPC ACL/);await db.exec('rollback');
 }finally{await db.close();}
});

test('real authorizer forwards same user token; RPC failures never read SQLite and alternate HTTP paths cannot bypass checks',async t=>{
 const stats=new FriendStatsStore(':memory:');const originalFetch=globalThis.fetch;
 let reads=0;const compare=t.mock.method(stats,'compare',()=>{reads++;return {hands:0,mine:{wins:0,netChips:0},friend:{wins:0,netChips:0}};});
 const token='header.'+Buffer.from(JSON.stringify({sub:a,role:'authenticated',session_id:session})).toString('base64url')+'.fixture';
 let authOk=true,mode='true';const calls:string[]=[];
 t.mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>{
  const url=String(input);calls.push(url);
  assert.equal((init?.headers as Record<string,string>).apikey,'sb_publishable_test');
  assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer '+token);
  if(url.endsWith('/current_account_session'))return new Response(JSON.stringify(authOk?a:null));
  assert.ok(url.endsWith('/can_compare_friend_stats')||url.endsWith('/list_friends'));
  if(url.endsWith('/list_friends'))return new Response(JSON.stringify([{other_id:b,status:mode==='pending'?'pending':'accepted'}]));
  assert.deepEqual(JSON.parse(String(init?.body)),{first_id:b,second_id:c});
  if(mode==='network')throw Error('network secret detail');
  if(mode==='timeout')throw new DOMException('timeout','TimeoutError');
  if(mode==='http')return new Response('private diagnostics',{status:500});
  return new Response(mode);
 });
 const authorize=accountAuthorizer('https://fixture.supabase.co','sb_publishable_test');
 for(const key of ['sb_secret_test','legacy.service.role',''])assert.throws(()=>friendStatsApi(stats,authorize,'https://fixture.supabase.co',key),/publishable/);
 const server=createAppServer(()=>true,friendStatsApi(stats,authorize,'https://fixture.supabase.co','sb_publishable_test'));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 async function get(path=`/friends/${b}/${c}/stats`,method='GET'){return originalFetch(base+path,{method,headers:{Authorization:'Bearer '+token}});}
 try{
  for(const value of ['false','null','"true"','1','{}','[true]','invalid-json','network','timeout','http']){
   mode=value;const response=await get();assert.equal(response.status,['invalid-json','network','timeout','http'].includes(mode)?503:403);
   const body=await response.text();assert.equal(/hands|diagnostics|secret/.test(body),false);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(reads,0);
  }
  mode='true';assert.equal((await get()).status,200);assert.equal(reads,1);assert.deepEqual(compare.mock.calls[0].arguments,[b,c]);
  authOk=false;const before=calls.length;assert.equal((await get()).status,401);assert.equal(calls.length,before+1);assert.equal(reads,1);authOk=true;
  for(const path of ['/stats','/account_results','/data/stats.sqlite',`/friends/${b}/${c}/stats?accountId=${d}`,`/friends/${b}/${c}/stats/`,`/friends/${b}/${c}/stats/extra`])assert.equal((await get(path)).status,404);
  assert.equal((await get(undefined,'POST')).status,404);assert.equal(reads,1);
  mode='pending';assert.equal((await get(`/friends/${b}/stats`)).status,403);assert.equal(reads,1);
  mode='true';assert.equal((await get(`/friends/${b}/stats`)).status,200);assert.deepEqual(compare.mock.calls[1].arguments,[a,b]);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));stats.close();}
});
