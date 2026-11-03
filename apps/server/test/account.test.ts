import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authStorage} from '../../mobile/src/services/authStorage.ts';

test('encrypted adapter chunks sessions, serializes updates and preserves previous session on failure',async()=>{
 const data=new Map<string,string>();let fail=false;
 const store=authStorage({getItemAsync:async k=>data.get(k)??null,setItemAsync:async(k,v)=>{assert.ok(v.length<=1500);if(fail&&k.endsWith('.1'))throw Error('disk');data.set(k,v);},deleteItemAsync:async k=>{data.delete(k);}});
 await store.setItem('session','old');fail=true;
 await assert.rejects(store.setItem('session','x'.repeat(5000)));assert.equal(await store.getItem('session'),'old');
 fail=false;await Promise.all([store.setItem('session','x'.repeat(5000)),store.setItem('session','last')]);assert.equal(await store.getItem('session'),'last');
 await store.removeItem('session');assert.equal(await store.getItem('session'),null);assert.equal(data.size,0);
});
