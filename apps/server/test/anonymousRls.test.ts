import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',c='00000000-0000-0000-0000-000000000003';
test('all migrations preserve existing profiles and enforce anonymous UUID ownership, friendship consent and current sessions',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users,created_at timestamptz not null default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('request.jwt.claim.session_id',true),'is_anonymous',true)$$;
 grant usage on schema auth,public to authenticated,anon;`);
 const migrate=async(name:string)=>{await db.exec(readFileSync(new URL('../../../supabase/migrations/'+name+'.sql',import.meta.url),'utf8'));};
 for(const name of ['001_accounts','002_friends','003_single_session'])await migrate(name);
 await db.query(`insert into auth.users(id,raw_user_meta_data) values($1,'{"nickname_setup_complete":true}'),($2,'{}')`,[a,b]);
 await db.query("update public.profiles set display_name='기존친구' where id=$1",[b]);
 await db.query("insert into public.friendships(requester,recipient,status) values($1,$2,'accepted')",[a,b]);
 await migrate('004_anonymous_onboarding');await migrate('004_anonymous_onboarding');
 assert.equal((await db.query('select * from public.profiles where nickname_setup_complete')).rows.length,2);
 assert.equal((await db.query('select * from public.friendships')).rows.length,1);
 await db.query('insert into auth.users(id,is_anonymous) values($1,true)',[c]);
 for(const id of [a,b,c])await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[id]);
 const code=(await db.query<{friend_code:string}>('select friend_code from public.profiles where id=$1',[b])).rows[0].friend_code;
 async function as(id:string,sid=id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)",[id,sid]);await db.exec('set role authenticated');}
 await as(c);
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
 await as(c,a);assert.equal((await db.query('select * from public.profiles')).rows.length,0);
 await assert.rejects(db.query('select public.request_friend($1)',[code]),/AUTH_REQUIRED/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.profiles'),/permission denied/);
 await assert.rejects(db.query('select * from public.list_friends()'),/permission denied/);
 }finally{await db.close();}
});
