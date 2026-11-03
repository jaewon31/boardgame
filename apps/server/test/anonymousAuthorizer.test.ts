import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accountAuthorizer} from '../src/accountSession.ts';
const accountId='00000000-0000-0000-0000-000000000001',sessionId='10000000-0000-0000-0000-000000000001';
test('server accepts anonymous verified UUID and rejects forged, revoked and unavailable sessions',async(t)=>{
 let status=200,body:unknown=accountId;
 const token='header.'+Buffer.from(JSON.stringify({sub:'forged-client-id',session_id:sessionId,is_anonymous:true})).toString('base64url')+'.signature';
 t.mock.method(globalThis,'fetch',async(_url:unknown,options:RequestInit)=>{
  assert.equal(_url,'https://test.supabase.co/rest/v1/rpc/current_account_session');
  assert.equal(options.method,'POST');assert.equal(options.body,'{}');
  assert.equal((options.headers as Record<string,string>).Authorization,'Bearer '+token);
  return new Response(JSON.stringify(body),{status});
 });
 const authorize=accountAuthorizer('https://test.supabase.co','sb_publishable_test');
 assert.deepEqual(await authorize(token),{accountId,sessionId});
 body=null;assert.equal(await authorize(token),null);
 status=401;assert.equal(await authorize(token),null);
 status=404;body={code:'PGRST202'};await assert.rejects(authorize(token),/unavailable/);
 status=503;await assert.rejects(authorize(token),/unavailable/);
 assert.equal(await authorize(''),null);
});
