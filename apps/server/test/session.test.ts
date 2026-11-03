import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { RoomClient, type RoomState, type SavedSession, type SessionStore } from '../../mobile/src/services/RoomClient.ts';

async function until(predicate:()=>boolean) {
  const deadline=Date.now()+2000;
  while(!predicate()) { if(Date.now()>deadline) throw new Error('Condition timeout'); await new Promise(r=>setTimeout(r,5)); }
}
test('app relaunch resumes saved membership; dispose preserves it and explicit leave deletes it',async t=>{
  const server=new WebSocketServer({host:'127.0.0.1',port:0}); await once(server,'listening');
  const clients:RoomClient[]=[];
  t.after(async()=>{clients.forEach(c=>c.dispose());for(const s of server.clients)s.terminate();await new Promise<void>(r=>server.close(()=>r()));});
  let saved:SavedSession|null=null, resumes=0;
  const store:SessionStore={load:async()=>saved,save:async value=>{saved=value;}};
  server.on('connection',socket=>socket.on('message',data=>{
    const m=JSON.parse(data.toString());
    if(m.type==='ping'){socket.send(JSON.stringify({type:'pong',id:m.id}));return;}
    if(m.type==='leave'){socket.send(JSON.stringify({type:'left'}));return;}
    if(m.type==='resume'){resumes++;assert.equal(m.token,'secret');}
    socket.send(JSON.stringify({type:'joined',room:{code:'ABCDEFGH',game:'holdem',hostId:'a',maxPlayers:6,players:[]},playerId:'a',token:'secret'}));
  }));
  const endpoint=`ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let state:RoomState|undefined;
  const first=new RoomClient(endpoint,s=>{state=s;},{},store); clients.push(first);
  first.enter({type:'create',game:'holdem',nickname:'A'}); await until(()=>state?.status==='connected'&&!!saved);
  first.dispose(); assert.ok(saved);
  const second=new RoomClient(endpoint,s=>{state=s;},{},store); clients.push(second);
  await second.restore(); await until(()=>resumes===1&&state?.status==='connected');
  assert.equal(state?.playerId,'a');
  second.leave(); await until(()=>saved===null); assert.equal(state?.status,'idle');
});
test('cancelled async restore cannot reopen a socket or reclaim a departed seat',async()=>{
  let complete!:(value:SavedSession|null)=>void;
  let state:RoomState|undefined;
  const client=new RoomClient('ws://127.0.0.1:1',s=>{state=s;},{},{load:()=>new Promise(r=>{complete=r;}),save:async()=>{}});
  const restoring=client.restore(); client.leave(); complete({code:'ABCDEFGH',token:'secret'}); await restoring;
  assert.equal(state?.status,'error'); client.dispose();
});
test('expired saved session is removed instead of being retried on every launch',async t=>{
  const server=new WebSocketServer({host:'127.0.0.1',port:0}); await once(server,'listening');
  let saved:SavedSession|null={code:'ABCDEFGH',token:'secret'};
  let state:RoomState|undefined;
  const client=new RoomClient(`ws://127.0.0.1:${(server.address() as AddressInfo).port}`,s=>{state=s;},{},{load:async()=>saved,save:async v=>{saved=v;}});
  t.after(async()=>{client.dispose();for(const s of server.clients)s.terminate();await new Promise<void>(r=>server.close(()=>r()));});
  server.on('connection',s=>s.on('message',()=>s.send(JSON.stringify({type:'error',code:'SESSION_EXPIRED',message:'expired'}))));
  await client.restore(); await until(()=>saved===null&&state?.status==='error'); assert.equal(state?.error,'expired');
});
