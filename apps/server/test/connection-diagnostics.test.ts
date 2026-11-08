import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { attachLobby } from '../src/lobby.ts';
import { createAppServer } from '../src/http.ts';
import { logRecord, transportFailure } from '@boardgame/shared';

async function until(predicate:()=>boolean) {
  const deadline=Date.now()+3000;
  while(!predicate()){if(Date.now()>deadline)throw Error('Diagnostic timeout');await new Promise(r=>setTimeout(r,5));}
}
test('Railway default stdout has a display body and correlates wire IDs, auth timing and heartbeat termination',async t=>{
  const logs:Record<string,unknown>[]=[];
  t.mock.method(console,'info',(line:string)=>{logs.push(JSON.parse(line));});
  const server=createAppServer();
  const lobby=attachLobby(server,{heartbeatMs:40,authorize:async token=>{
    await new Promise(r=>setTimeout(r,5));
    return token==='SECRET_AUTH'?{accountId:'PRIVATE_ACCOUNT',sessionId:'PRIVATE_SESSION'}:null;
  }});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`ws://127.0.0.1:${(server.address() as AddressInfo).port}/lobby`;
  const sockets:WebSocket[]=[];
  t.after(async()=>{sockets.forEach(s=>s.terminate());lobby.close();await new Promise<void>(r=>server.close(()=>r()));});
  const healthy=new WebSocket(url);sockets.push(healthy);
  const messages:Record<string,any>[]=[];healthy.on('message',raw=>messages.push(JSON.parse(raw.toString())));
  await once(healthy,'open');
  healthy.send(JSON.stringify({type:'create',nickname:'PRIVATE_NAME',game:'holdem',accessToken:'SECRET_AUTH'}));
  await until(()=>messages.some(m=>m.type==='joined'));
  const greeting=messages.find(m=>m.type==='connection')!;
  assert.ok(greeting.connectionId);assert.ok(greeting.serverId);
  healthy.send(JSON.stringify({type:'ping',id:7,accessToken:'SECRET_AUTH'}));
  await until(()=>messages.some(m=>m.type==='pong'&&m.id===7));
  assert.ok(logs.some(e=>e.event==='ws_app_ping_received'&&e.connectionId===greeting.connectionId&&e.pingId===7));
  assert.ok(logs.some(e=>e.event==='ws_app_pong_sent'&&e.authMs!==undefined&&e.connectionId===greeting.connectionId));
  const silent=new WebSocket(url,{autoPong:false});sockets.push(silent);
  const ended=once(silent,'close');await once(silent,'open');
  assert.equal((await ended)[0],1006);
  assert.equal(healthy.readyState,WebSocket.OPEN);
  assert.ok(logs.some(e=>e.event==='ws_transport_pong'&&e.connectionId===greeting.connectionId));
  assert.ok(logs.some(e=>e.event==='ws_transport_timeout'&&e.connectionId!==greeting.connectionId));
  assert.ok(logs.every(e=>typeof e.message==='string'&&e.message===e.event&&e.level==='info'&&!Number.isNaN(Date.parse(String(e.timestamp)))));
  const output=JSON.stringify(logs);
  for(const secret of ['SECRET_AUTH','PRIVATE_ACCOUNT','PRIVATE_SESSION','PRIVATE_NAME',messages.find(m=>m.type==='joined')!.token])assert.ok(!output.includes(secret));
});
test('JSON event-only output has no Railway display body; normalized records preserve fields',()=>{
  const previous=JSON.parse(JSON.stringify({event:'ws_close',code:1006}));
  assert.equal(previous.message,undefined);
  const updated=JSON.parse(JSON.stringify(logRecord(previous)));
  assert.equal(updated.message,'ws_close');assert.equal(updated.code,1006);assert.equal(updated.level,'info');
  assert.equal(logRecord({event:'persistence_failed'},'error').level,'error');
});

test('native failure classification cannot disclose the original URL or error text',()=>{
  for (const [input,expected] of [
    ['timeout at wss://private.example/?token=SECRET','timeout'],
    ['Unable to resolve host private.example','dns'],
    ['SSL certificate SECRET','tls'],['ECONNREFUSED SECRET','refused'],
    ['Connection reset SECRET','reset'],['unexpected end of stream SECRET','closed'],['SECRET','unknown'],
  ]) assert.equal(transportFailure(input),expected);
});
