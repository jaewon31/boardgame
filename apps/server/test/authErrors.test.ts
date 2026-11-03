import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authFailure,logAuthFailure} from '../../mobile/src/services/authErrors.ts';
test('auth failures distinguish network, anonymous signup and configuration failures',()=>{
 for(const [code,category] of Object.entries({signup_disabled:'signupDisabled',anonymous_provider_disabled:'anonymousDisabled',saved_account_unavailable:'savedAccount',over_anonymous_users_rate_limit:'rateLimit',auth_not_configured:'configuration'}))assert.equal(authFailure({code}).diagnostic.category,category);
 assert.equal(authFailure({name:'AuthRetryableFetchError',status:0}).diagnostic.category,'network');
 assert.equal(authFailure(new TypeError('Network request failed')).diagnostic.category,'network');
 assert.equal(authFailure({name:'AuthRetryableFetchError',status:503}).diagnostic.category,'server');
 assert.equal(authFailure({status:401}).diagnostic.category,'configuration');
 assert.equal(authFailure({status:429}).diagnostic.category,'rateLimit');
});
test('diagnostics never expose arbitrary error fields and stay silent in production',()=>{
 const secret='private@example.com password token sb_publishable_secret';
 const error={name:secret,message:secret,code:secret,stack:secret,status:400,url:secret};
 const logs:unknown[]=[];const original=console.warn;console.warn=(...args)=>{logs.push(args);};
 try {logAuthFailure('send_email_otp',error,false);assert.equal(logs.length,0);logAuthFailure('send_email_otp',error,true);assert.equal(logs.length,1);assert.ok(!JSON.stringify(logs).includes(secret));assert.equal(authFailure(null).diagnostic.category,'unknown');}finally{console.warn=original;}
});

test('missing RPC/table is a schema deployment failure without raw error disclosure',()=>{
 for(const code of ['PGRST202','PGRST205','25006']){
  const failure=authFailure({code,message:'secret-token',details:'private project',status:404});
  assert.equal(failure.diagnostic.category,'databaseSchema');
  assert.equal(failure.diagnostic.code,code);
  assert.ok(!JSON.stringify(failure).includes('secret-token'));
 }
});
