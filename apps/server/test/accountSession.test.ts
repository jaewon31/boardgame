import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const user='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const old='10000000-0000-0000-0000-000000000001',fresh='10000000-0000-0000-0000-000000000002';
test('latest Auth login wins; refresh, logout, replay and another user cannot revive the old session',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users,created_at timestamptz not null);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('request.jwt.claim.session_id',true))$$;
 grant usage on schema auth,public to authenticated,anon;`);
 for(const name of ['001_accounts','002_friends','003_single_session','003_single_session'])await db.exec(readFileSync(new URL('../../../supabase/migrations/'+name+'.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1),($2)',[user,other]);
 await db.query("insert into auth.sessions values($1,$2,'2026-01-01')",[old,user]);
 async function as(uid:string,sid:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)",[uid,sid]);await db.exec('set role authenticated');}
 async function current(){return (await db.query<{id:string|null}>('select public.current_account_session() id')).rows[0].id;}
 await as(user,old);assert.equal(await current(),user);assert.equal((await db.query('select * from public.profiles')).rows.length,1);
 await assert.rejects(db.query('select * from public.account_sessions'),/permission denied/);
 await db.exec('reset role');await db.query("insert into auth.sessions values($1,$2,'2026-01-02')",[fresh,user]);
 await as(user,old);assert.equal(await current(),null);assert.equal((await db.query('select * from public.profiles')).rows.length,0);
 await assert.rejects(db.query("select public.request_friend('AAAAAAAAAAAA')"),/AUTH_REQUIRED/);
 assert.equal((await db.query('select * from public.list_friends()')).rows.length,0);
 await as(user,fresh);assert.equal(await current(),user);assert.equal(await current(),user);assert.equal((await db.query('select * from public.list_friends()')).rows.length,0);
 await as(other,fresh);assert.equal(await current(),null);
 await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[fresh]);
 await as(user,old);assert.equal(await current(),null);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select public.current_account_session()'),/permission denied/);
 }finally{await db.close();}
});
