import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',c='00000000-0000-0000-0000-000000000003';
test('friend RPCs enforce consent, private profiles, no spoofing, idempotency and both-side removal',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 await db.exec(readFileSync(new URL('../../../supabase/migrations/001_accounts.sql',import.meta.url),'utf8'));
 const migration=readFileSync(new URL('../../../supabase/migrations/002_friends.sql',import.meta.url),'utf8');
 await db.exec(migration);await db.exec(migration);
 await db.query('insert into auth.users(id) values($1),($2),($3)',[a,b,c]);
 await db.query(`update public.profiles set display_name=case id when $1 then 'A' when $2 then 'B' else 'C' end,friend_code=case id when $1 then 'AAAAAAAAAAAA' when $2 then 'BBBBBBBBBBBB' else 'CCCCCCCCCCCC' end`,[a,b]);
 async function as(id:string){await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id]);await db.exec('set role authenticated');}
 await as(a);
 assert.equal((await db.query('select * from public.profiles')).rows.length,1);
 await assert.rejects(db.query(`select public.request_friend('AAAAAAAAAAAA')`),/SELF_REQUEST/);
 await assert.rejects(db.query(`select public.request_friend('FFFFFFFFFFFF')`),/FRIEND_NOT_FOUND/);
 await db.query(`select public.request_friend('bbbbbbbbbbbb')`);
 await db.query(`select public.request_friend('BBBBBBBBBBBB')`);
 const outgoing=(await db.query<{id:string;incoming:boolean;status:string}>('select * from public.list_friends()')).rows;
 assert.equal(outgoing.length,1);assert.equal(outgoing[0].incoming,false);assert.equal(outgoing[0].status,'pending');
 const request=outgoing[0].id;
 await assert.rejects(db.query('select public.respond_friend($1,true)',[request]),/REQUEST_UNAVAILABLE/);
 await assert.rejects(db.query(`update public.friendships set status='accepted'`),/permission denied/);
 await as(c);assert.equal((await db.query('select * from public.friendships')).rows.length,0);assert.equal((await db.query('select * from public.list_friends()')).rows.length,0);
 await assert.rejects(db.query('select public.respond_friend($1,true)',[request]),/REQUEST_UNAVAILABLE/);
 await assert.rejects(db.query('select public.remove_friend($1)',[request]),/REQUEST_UNAVAILABLE/);
 await as(b);assert.equal((await db.query<{request_friend:string}>(`select public.request_friend('AAAAAAAAAAAA')`)).rows[0].request_friend,'incoming_request');
 await db.query('select public.respond_friend($1,true)',[request]);
 assert.equal((await db.query<{status:string}>('select * from public.list_friends()')).rows[0].status,'accepted');
 await as(a);assert.equal((await db.query<{request_friend:string}>(`select public.request_friend('BBBBBBBBBBBB')`)).rows[0].request_friend,'already_friends');
 await db.query('select public.remove_friend($1)',[request]);
 assert.equal((await db.query('select * from public.list_friends()')).rows.length,0);
 await db.query(`select public.request_friend('BBBBBBBBBBBB')`);await as(b);
 const second=(await db.query<{id:string}>('select * from public.list_friends()')).rows[0].id;
 await db.query('select public.respond_friend($1,false)',[second]);
 assert.equal((await db.query('select * from public.list_friends()')).rows.length,0);
 await as(a);await db.query(`select public.request_friend('BBBBBBBBBBBB')`);const third=(await db.query<{id:string}>('select * from public.list_friends()')).rows[0].id;
 await db.query('select public.remove_friend($1)',[third]);
 await db.exec(`reset role;set role anon;`);await assert.rejects(db.query('select * from public.list_friends()'),/permission denied/);
 await db.exec('reset role');await db.query(`update public.friend_request_limits set requests=30 where user_id=$1`,[a]);await as(a);
 await assert.rejects(db.query(`select public.request_friend('BBBBBBBBBBBB')`),/DAILY_REQUEST_LIMIT/);
 }finally{await db.close();}
});
