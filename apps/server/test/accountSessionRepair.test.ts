import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {WebSocket} from 'ws';
import {createAppServer} from '../src/http.ts';
import {attachLobby} from '../src/lobby.ts';
import {PGlite} from '@electric-sql/pglite';
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',c='00000000-0000-0000-0000-000000000003';
for(const repairMissingSession of [false,true])test(`repair migration preserves data and anonymous access (missing session migration: ${repairMissingSession})`,async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users,created_at timestamptz not null default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('request.jwt.claim.session_id',true),'is_anonymous',true)$$;
 grant usage on schema auth,public to authenticated,anon;`);
 const migrate=async(name:string)=>{await db.exec(readFileSync(new URL('../../../supabase/migrations/'+name+'.sql',import.meta.url),'utf8'));};
 for(const name of (repairMissingSession?['001_accounts','002_friends']:['001_accounts','002_friends','003_single_session']))await migrate(name);
 await db.query(`insert into auth.users(id,raw_user_meta_data) values($1,'{"nickname_setup_complete":true}'),($2,'{}')`,[a,b]);
 await db.query("update public.profiles set display_name='기존친구' where id=$1",[b]);
 await db.query("insert into public.friendships(requester,recipient,status) values($1,$2,'accepted')",[a,b]);
 if(!repairMissingSession)await migrate('004_anonymous_onboarding');
 await migrate('005_repair_account_session');await migrate('005_repair_account_session');
 const signature=(await db.query<{args:number;result:string}>("select pronargs args,pg_get_function_result(oid) result from pg_proc where oid='public.current_account_session()'::regprocedure")).rows[0];
 assert.deepEqual(signature,{args:0,result:'uuid'});
 assert.equal((await db.query('select * from public.profiles where nickname_setup_complete')).rows.length,2);
 assert.equal((await db.query('select * from public.friendships')).rows.length,1);
 await db.query('insert into auth.users(id,is_anonymous) values($1,true)',[c]);
 for(const id of [a,b,c])await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[id]);
 const code=(await db.query<{friend_code:string}>('select friend_code from public.profiles where id=$1',[b])).rows[0].friend_code;
 async function as(id:string,sid=id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)",[id,sid]);await db.exec('set role authenticated');}
 await as(c);
 await db.query('select public.current_account_session()');
 // Reproduce PostgREST GET: the old RLS function writes in a read-only transaction.
 await db.exec('begin read only');
 await assert.rejects(db.query('select * from public.profiles'),(e:unknown)=>(e as {code:string}).code==='25006');
 await db.exec('rollback;reset role');
 await migrate('006_readonly_session_policies');await migrate('006_readonly_session_policies');
 await as(c);await db.exec('begin read only');
 assert.equal((await db.query('select * from public.profiles')).rows.length,1);
 await db.query('select * from public.friendships');
 await db.exec('commit');
 const own=(await db.query<{id:string;nickname_setup_complete:boolean}>('select * from public.profiles')).rows;
 assert.equal(own.length,1);assert.equal(own[0].id,c);assert.equal(own[0].nickname_setup_complete,false);
 assert.equal((await db.query('select * from public.friendships')).rows.length,0);
 assert.equal((await db.query('select * from public.list_friends()')).rows.length,0);
 assert.equal((await db.query("update public.profiles set display_name='탈취' where id=$1 returning id",[b])).rows.length,0);
 await assert.rejects(db.query('update public.profiles set id=$1 where id=$2',[b,c]),/permission denied/);
 await db.query("update public.profiles set display_name='플레이어',nickname_setup_complete=true where id=$1",[c]);
 assert.equal((await db.query<{nickname_setup_complete:boolean}>('select * from public.profiles')).rows[0].nickname_setup_complete,true);
 await db.query('select public.request_friend($1)',[code]);
 const request=(await db.query<{id:string}>('select * from public.list_friends()')).rows[0].id;
 await assert.rejects(db.query('select public.respond_friend($1,true)',[request]),/REQUEST_UNAVAILABLE/);
 await as(a);await assert.rejects(db.query('select public.respond_friend($1,true)',[request]),/REQUEST_UNAVAILABLE/);
 await assert.rejects(db.query('select public.remove_friend($1)',[request]),/REQUEST_UNAVAILABLE/);
 await as(b);await db.query('select public.respond_friend($1,true)',[request]);
 await as(c);assert.equal((await db.query<{status:string}>('select * from public.list_friends()')).rows[0].status,'accepted');
 // Exercise real lobby transport with the same SQL-verified anonymous identity.
 // Auth JWT issuance is simulated by the auth fixture above, not hosted Supabase.
 const server=createAppServer();
 const lobby=attachLobby(server,{authorize:async token=>{
  if(token!=='fixture-session')return null;
  const id=(await db.query<{id:string|null}>('select public.current_account_session() id')).rows[0].id;
  return id?{accountId:id,sessionId:c}:null;
 }});
 let socket:WebSocket|undefined;
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  socket=new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/lobby`);
  await once(socket,'open');
  const joined=once(socket,'message',{signal:AbortSignal.timeout(3000)});
  socket.send(JSON.stringify({type:'create',game:'holdem',nickname:'플레이어',accessToken:'fixture-session'}));
  const message=JSON.parse((await joined)[0].toString());
  assert.equal(message.type,'joined');assert.equal(message.room.players.length,1);
  assert.equal(message.room.hostId,message.playerId);
 }finally{socket?.terminate();lobby.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 await as(c,a);assert.equal((await db.query('select * from public.profiles')).rows.length,0);
 await assert.rejects(db.query('select public.request_friend($1)',[code]),/AUTH_REQUIRED/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.profiles'),/permission denied/);
 await assert.rejects(db.query('select * from public.list_friends()'),/permission denied/);
 }finally{await db.close();}
});
