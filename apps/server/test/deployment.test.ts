import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@boardgame/shared';
import { SqliteStateStore } from '../src/stateStore.ts';
import { attachLobby } from '../src/lobby.ts';
import { createAppServer } from '../src/http.ts';
import { HoldemHand } from '../src/holdem/hand.ts';
import { serverConfig } from '../src/config.ts';
import { clientIp } from '../src/network.ts';
import { validEndpoint } from '../../mobile/src/services/endpoint.ts';

test('release configuration rejects insecure endpoints and missing persistence', () => {
  for (const url of ['', 'ws://game.example.com/lobby','wss://localhost/lobby','wss://127.0.0.1/lobby','wss://10.0.0.1/lobby','wss://[::ffff:127.0.0.1]/lobby','wss://[fc00::1]/lobby','wss://game.example.com/other','wss://user:pass@game.example.com/lobby']) assert.equal(validEndpoint(url,true),false,url);
  assert.equal(validEndpoint('wss://game.example.com/lobby',true),true);
  assert.equal(validEndpoint('ws://127.0.0.1:3000/lobby',false),true);
  assert.throws(()=>serverConfig({NODE_ENV:'production'}),/STATE_DB_PATH/);
  assert.throws(()=>serverConfig({TRUSTED_PROXY_IPS:'*'}),/TRUSTED/);
  assert.throws(()=>serverConfig({PORT:'abc'}),/PORT/);
});

test('only the trusted proxy can supply the client IP; spoofed leading hops are ignored', () => {
  assert.equal(clientIp('1.2.3.4','8.8.8.8',[]),'1.2.3.4');
  assert.equal(clientIp('::ffff:172.30.50.2','spoof, 1.2.3.4',['172.30.50.2']),'172.30.50.2');
  assert.equal(clientIp('172.30.50.2','8.8.8.8, 1.2.3.4',['172.30.50.2']),'1.2.3.4');
  assert.equal(clientIp('172.30.50.2','1.2.3.4, 172.30.50.4',['172.30.50.2','172.30.50.4']),'1.2.3.4');
});

test('all hand phases survive serialization with private cards, deck order and payouts intact', () => {
  let hand = new HoldemHand([{id:'a',nickname:'A',stack:1000},{id:'b',nickname:'B',stack:1000}]);
  const roundtrip = () => {
    const clone = HoldemHand.restore(JSON.parse(JSON.stringify(hand.checkpoint())));
    for(const id of ['a','b','spectator']) assert.deepEqual(clone.viewFor(id),hand.viewFor(id));
    return clone;
  };
  hand=roundtrip(); hand.act(hand.actorId!,'allIn'); hand=roundtrip(); hand.act(hand.actorId!,'call');
  while(!hand.complete) { hand=roundtrip(); hand.timeout(); }
  hand=roundtrip();
  assert.equal(hand.players.reduce((sum,p)=>sum+p.stack,0),2000);
  const loser=hand.players.find(p=>hand.canReveal(p.id));
  if(loser) { hand.revealCards(loser.id); roundtrip(); }
});

class Peer {
  socket: WebSocket;
  queue: ServerMessage[]=[];
  constructor(url:string) { this.socket=new WebSocket(url); this.socket.on('message',data=>this.queue.push(JSON.parse(data.toString()))); }
  send(value:unknown) { this.socket.send(JSON.stringify(value)); }
  async next(type:ServerMessage['type'], predicate:(m:any)=>boolean=()=>true):Promise<any> {
    const deadline=Date.now()+3000;
    while(Date.now()<deadline) { const i=this.queue.findIndex(m=>m.type===type&&predicate(m)); if(i>=0)return this.queue.splice(i,1)[0]; await new Promise(r=>setTimeout(r,5)); }
    throw new Error(`Missing ${type}`);
  }
}
async function start(path:string) {
  const store=new SqliteStateStore(path), server=createAppServer();
  const lobby=attachLobby(server,{store,nextHandMs:50});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const peers:Peer[]=[]; let closed=false;
  return {
    store,
    async connect() { const p=new Peer(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/lobby`); peers.push(p); await once(p.socket,'open'); return p; },
    async close() { if(closed)return; closed=true; lobby.close(); for(const p of peers)p.socket.terminate(); await new Promise<void>(r=>server.close(()=>r())); store.close(); },
  };
}
test('SQLite restart restores the same room, seat, private hand and legal action; late join enters next hand', async t => {
  const dir=mkdtempSync(join(tmpdir(),'boardgame-')); const path=join(dir,'state.sqlite');
  let app=await start(path); t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
  const a=await app.connect(), b=await app.connect();
  a.send({type:'create',nickname:'A',game:'holdem'}); const first=await a.next('joined');
  b.send({type:'join',nickname:'B',code:first.room.code}); const second=await b.next('joined');
  a.send({type:'startHand',previousHandId:null}); const before=(await a.next('room',m=>!!m.room.holdem)).room.holdem;
  assert.throws(()=>new SqliteStateStore(path),/locked/);
  await app.close(); app=await start(path);
  const ra=await app.connect(), rb=await app.connect(), c=await app.connect();
  ra.send({type:'resume',code:first.room.code,token:first.token}); const restored=await ra.next('joined');
  rb.send({type:'resume',code:first.room.code,token:second.token}); await rb.next('joined');
  assert.equal(restored.playerId,first.playerId); assert.equal(restored.room.holdem.id,before.id);
  assert.deepEqual(restored.room.holdem.players,before.players); assert.deepEqual(restored.room.holdem.legal,before.legal);
  assert.ok(restored.room.holdem.deadline>Date.now());
  c.send({type:'join',code:first.room.code,nickname:'C'}); const waiting=await c.next('joined');
  assert.equal(waiting.room.holdem.players.length,2); assert.ok(waiting.room.holdem.players.every((p:any)=>p.cards===null));
  c.send({type:'act',handId:before.id,revision:before.revision,action:'fold'}); await c.next('error');
  ra.send({type:'act',handId:before.id,revision:before.revision,action:'fold'});
  const next=(await c.next('room',m=>m.room.holdem?.number===2)).room.holdem;
  assert.equal(next.players.length,3); assert.equal(next.players.find((p:any)=>p.id===waiting.playerId).cards.length,2);
});

test('failed persistence closes the lobby before acknowledging a newly created room', async t => {
  const server=createAppServer();
  let failed=false;
  const lobby=attachLobby(server,{store:{load:()=>null,save:()=>{throw new Error('disk full');}},onFatal:()=>{failed=true;}});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async()=>{lobby.close();await new Promise<void>(r=>server.close(()=>r()));});
  const p=new Peer(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/lobby`); await once(p.socket,'open');
  const closed=once(p.socket,'close'); p.send({type:'create',game:'holdem',nickname:'A'}); await closed;
  assert.equal(failed,true); assert.equal(lobby.healthy(),false); assert.equal(p.queue.some(m=>m.type==='joined'),false);
});


test('room settings and once-only daily results survive SQLite restart and chip resets',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'boardgame-settings-')),path=join(dir,'state.sqlite');
  let app=await start(path);t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
  const a=await app.connect(), b=await app.connect();
  const settings={startingChips:5000,smallBlind:25,bigBlind:50,turnSeconds:60};
  a.send({type:'create',nickname:'A',game:'holdem',settings});const first=await a.next('joined');
  b.send({type:'join',nickname:'B',code:first.room.code});await b.next('joined');
  a.send({type:'startHand',previousHandId:null});const hand=(await a.next('room',m=>!!m.room.holdem)).room.holdem;
  a.send({type:'act',handId:hand.id,revision:0,action:'fold'});
  const done=(await a.next('room',m=>m.room.holdem?.street==='complete')).room;
  await app.close();app=await start(path);
  const ra=await app.connect();ra.send({type:'resume',code:first.room.code,token:first.token});
  const restored=(await ra.next('joined')).room;
  assert.deepEqual(restored.settings,settings);assert.deepEqual(restored.todayResults,done.todayResults);
  assert.equal(done.handReviews.length,1);
  assert.deepEqual(restored.handReviews,done.handReviews);
  assert.equal(restored.handReviews[0].hand.players.find((p:any)=>p.id===first.playerId).cards.length,2);
  assert.ok(restored.handReviews[0].hand.players.filter((p:any)=>p.id!==first.playerId).every((p:any)=>p.cards===null));
  ra.send({type:'revealCards',handId:hand.id});
  const again=(await ra.next('room',m=>m.room.holdem?.street==='complete')).room;
  assert.deepEqual(again.todayResults,done.todayResults);
  ra.send({type:'resetChips',handId:hand.id});
  const reset=(await ra.next('room',m=>!m.room.holdem)).room;
  assert.deepEqual(reset.settings,settings);assert.deepEqual(reset.todayResults,done.todayResults);assert.deepEqual(reset.handReviews,done.handReviews);
});
