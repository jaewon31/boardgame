import {test} from 'node:test';
import assert from 'node:assert/strict';
type Session={user:{id:string;is_anonymous:boolean};access_token:string};
import {ensureAccountSession} from '../../mobile/src/services/anonymousSession.ts';
function fixture(session:Session|null=null){
 let current=session,calls=0,error:Error|null=null,marker:string|null=null;
 const storage={getItem:async()=>marker,setItem:async(_key:string,value:string)=>{marker=value;}};
 const auth={getSession:async()=>({data:{session:current},error}),signInAnonymously:async()=>{
   calls++;current={user:{id:'anonymous-uuid',is_anonymous:true},access_token:'token'} as Session;
   return {data:{session:current,user:current.user},error:null};
 }} as unknown as Parameters<typeof ensureAccountSession>[0];
 return {auth,storage,get calls(){return calls;},fail:()=>{error=Error('network');},recover:()=>{error=null;},loseSession:()=>{current=null;}};
}
test('fresh launch creates once even during concurrent mounts and reuses persisted session',async()=>{
 const f=fixture();const [a,b]=await Promise.all([ensureAccountSession(f.auth,f.storage),ensureAccountSession(f.auth,f.storage)]);
 assert.equal(a.user.id,b.user.id);assert.equal(f.calls,1);
 assert.equal((await ensureAccountSession(f.auth,f.storage)).user.id,a.user.id);assert.equal(f.calls,1);
});
test('existing anonymous and permanent accounts retain exact UUID and tokens',async()=>{
 for(const anonymous of [true,false]){
  const session={user:{id:'existing-uuid',is_anonymous:anonymous},access_token:'existing'} as Session;
  const f=fixture(session);assert.equal(await ensureAccountSession(f.auth,f.storage),session);assert.equal(f.calls,0);
 }
});
test('restore errors never create a replacement account and retry is possible',async()=>{
 const f=fixture();f.fail();await assert.rejects(ensureAccountSession(f.auth,f.storage),/network/);assert.equal(f.calls,0);
 f.recover();await ensureAccountSession(f.auth,f.storage);assert.equal(f.calls,1);
});
test('lost session of a known account fails closed instead of silently abandoning its records',async()=>{
 const f=fixture();await ensureAccountSession(f.auth,f.storage);f.loseSession();
 await assert.rejects(ensureAccountSession(f.auth,f.storage),{code:'saved_account_unavailable'});assert.equal(f.calls,1);
});
test('disabled anonymous provider and missing session propagate without a retry loop',async()=>{
 for(const error of [{code:'anonymous_provider_disabled'},null]){
  const auth={getSession:async()=>({data:{session:null},error:null}),signInAnonymously:async()=>({data:{session:null,user:null},error})} as unknown as Parameters<typeof ensureAccountSession>[0];
  await assert.rejects(ensureAccountSession(auth,fixture().storage));
 }
});
