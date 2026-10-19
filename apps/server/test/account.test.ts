import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authStorage} from '../../mobile/src/services/authStorage.ts';
import {authCode} from '../../mobile/src/services/authCallback.ts';
test('auth callback only accepts the exact route and a single authorization code',()=>{
 assert.equal(authCode('friendstable://auth/callback?code=valid'),'valid');
 for(const url of ['https://auth/callback?code=x','friendstable://join/callback?code=x','friendstable://auth/callback?code=x&code=y','friendstable://auth/callback#access_token=secret'])assert.equal(authCode(url),null);
});
test('encrypted adapter chunks sessions, serializes updates and preserves previous session on failure',async()=>{
 const data=new Map<string,string>();let fail=false;
 const store=authStorage({getItemAsync:async k=>data.get(k)??null,setItemAsync:async(k,v)=>{assert.ok(v.length<=1500);if(fail&&k.endsWith('.1'))throw Error('disk');data.set(k,v);},deleteItemAsync:async k=>{data.delete(k);}});
 await store.setItem('session','old');fail=true;
 await assert.rejects(store.setItem('session','x'.repeat(5000)));assert.equal(await store.getItem('session'),'old');
 fail=false;await Promise.all([store.setItem('session','x'.repeat(5000)),store.setItem('session','last')]);assert.equal(await store.getItem('session'),'last');
 await store.removeItem('session');assert.equal(await store.getItem('session'),null);assert.equal(data.size,0);
});
