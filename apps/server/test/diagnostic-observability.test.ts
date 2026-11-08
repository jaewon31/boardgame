import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { attachLobby, type ConnectionDiagnostic } from '../src/lobby.ts';
import { createAppServer } from '../src/http.ts';
import { RoomClient, type ClientConnectionDiagnostic } from '../../mobile/src/services/RoomClient.ts';
async function until(fn:()=>boolean){const end=Date.now()+3000;while(!fn()){if(Date.now()>end)throw Error('Wait failed');await new Promise(r=>setTimeout(r,5));}}

test('enqueue logs distinguish receipt from blocked auth/queue without exposing payload',async t=>{
  const entries:ConnectionDiagnostic[]=[];let unblock!:()=>void, calls=0;
  const server=createAppServer();
  const lobby=attachLobby(server,{diagnostic:e=>entries.push(e),authorize:async()=>{
    if(++calls===2)await new Promise<void>(r=>{unblock=r;});
    return {accountId:'PRIVATE_UUID',sessionId:'PRIVATE_SESSION'};
  }});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const socket=new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/lobby`);
  t.after(async()=>{unblock?.();socket.terminate();lobby.close();await new Promise<void>(r=>server.close(()=>r()));});
  const received:any[]=[];socket.on('message',raw=>received.push(JSON.parse(raw.toString())));await once(socket,'open');
  socket.send(JSON.stringify({type:'create',game:'holdem',nickname:'PRIVATE_NAME',accessToken:'PRIVATE_TOKEN'}));
  await until(()=>received.some(m=>m.type==='joined'));
  socket.send(JSON.stringify({type:'ping',id:51,accessToken:'PRIVATE_TOKEN'}));await until(()=>!!unblock);
  socket.send(JSON.stringify({type:'ping',id:52,accessToken:'PRIVATE_TOKEN'}));
  await until(()=>entries.some(e=>e.event==='ws_message_enqueued'&&e.receiveSequence===3));
  assert.ok(!entries.some(e=>e.event==='ws_request_started'&&e.pingId===52));
  assert.equal(entries.find(e=>e.event==='ws_message_enqueued'&&e.receiveSequence===3)?.queueDepth,2);
  unblock();await until(()=>received.some(m=>m.type==='pong'&&m.id===52));
  const start=entries.find(e=>e.event==='ws_request_started'&&e.pingId===52)!;
  assert.equal(start.receiveSequence,3);assert.ok(start.queueWaitMs!>=0);
  assert.ok(entries.some(e=>e.event==='ws_auth_completed'&&e.pingId===51&&e.authMs!==undefined));
  assert.equal(socket.readyState,WebSocket.OPEN);
  assert.ok(!JSON.stringify(entries).includes('PRIVATE_'));
});

test('event loop diagnostics are bounded numeric values and stop with lobby',t=>{
  t.mock.timers.enable({apis:['setInterval']});const entries:ConnectionDiagnostic[]=[];
  const server=createAppServer();const lobby=attachLobby(server,{diagnostic:e=>entries.push(e)});
  t.after(()=>lobby.close());t.mock.timers.tick(15000);
  const metric=entries.find(e=>e.event==='server_event_loop');assert.ok(metric);
  assert.ok(Number.isFinite(metric.eventLoopMaxMs));assert.ok(Number.isFinite(metric.eventLoopMeanMs));
  lobby.close();const count=entries.length;t.mock.timers.tick(30000);assert.equal(entries.length,count);
});

test('app state logs whitelist input and delayed JS tick does not alter heartbeat policy',t=>{
  t.mock.timers.enable({apis:['setInterval']});let mono=0;t.mock.method(performance,'now',()=>mono);
  let socket:any;const original=globalThis.WebSocket;
  globalThis.WebSocket=class {static OPEN=1;readyState=1;onopen?:()=>void;onmessage?: (e:any)=>void;sent:any[]=[];
    constructor(){socket=this;}send(raw:string){this.sent.push(JSON.parse(raw));}close(){this.readyState=3;}
  } as any;
  const entries:ClientConnectionDiagnostic[]=[];let status='';
  const client=new RoomClient('ws://localhost/lobby',s=>{status=s.status;},{},undefined,e=>entries.push(e));
  t.after(()=>{client.dispose();globalThis.WebSocket=original;});
  client.recordAppState('PRIVATE_TOKEN');client.recordAppState('background');client.recordAppState('active');
  client.enter({type:'create',nickname:'PRIVATE_NAME',game:'holdem'});socket.onopen();
  socket.onmessage({data:JSON.stringify({type:'joined',room:{code:'ABCDEFGH'},playerId:'PRIVATE_UUID',token:'PRIVATE_TOKEN'})});
  mono=65000;t.mock.timers.tick(5000);
  const tick=entries.find(e=>e.event==='client_heartbeat_tick')!;assert.equal(tick.timerLagMs,60000);assert.equal(tick.appState,'active');
  assert.equal(status,'connected');assert.ok(socket.sent.some((m:any)=>m.type==='ping'));
  assert.ok(!JSON.stringify(entries).includes('PRIVATE_'));
});
