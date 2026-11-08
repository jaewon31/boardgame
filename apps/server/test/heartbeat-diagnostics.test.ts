import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { RoomClient, type RoomState, type ClientConnectionDiagnostic } from '../../mobile/src/services/RoomClient.ts';

class Transport {
  static OPEN = 1; static CONNECTING = 0;
  readyState = 1;
  onopen?: () => void; onmessage?: (event: {data:string}) => void;
  onclose?: (event:{code:number;reason:string;wasClean:boolean}) => void;
  onerror?: () => void;
  sent: Record<string,unknown>[] = [];
  close() { this.readyState = 3; }
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  receive(message: unknown) { this.onmessage?.({data:JSON.stringify(message)}); }
}
function setup(t: TestContext) {
  let clock=1000, transport!: Transport, state:RoomState|undefined;
  t.mock.method(Date,'now',()=>clock);
  const original=globalThis.WebSocket;
  globalThis.WebSocket=class extends Transport {constructor(){super();transport=this;}} as unknown as typeof WebSocket;
  t.after(()=>{globalThis.WebSocket=original;});
  const logs:ClientConnectionDiagnostic[]=[];
  const client=new RoomClient('ws://localhost/lobby',s=>{state=s;},{heartbeatMs:60000,heartbeatTimeoutMs:15000,retryMs:60000},undefined,e=>logs.push(e));
  t.after(()=>client.dispose());
  client.enter({type:'create',game:'holdem',nickname:'A'});transport.onopen?.();
  transport.receive({type:'joined',room:{code:'ABCDEFGH',players:[]},playerId:'seat',token:'private-seat-token'});
  return {client,logs,transport,advance:(ms:number)=>{clock+=ms;},get state(){return state;}};
}
test('a paused JS timer probes the OPEN socket before declaring heartbeat failure',t=>{
  const app=setup(t);app.advance(60000);app.client.checkConnection();
  assert.equal(app.state?.status,'connected');
  const ping=app.transport.sent.find(m=>m.type==='ping');assert.ok(ping);
  app.transport.receive({type:'pong',id:ping.id});
  app.advance(5000);app.client.checkConnection();assert.equal(app.state?.status,'connected');
});
test('a missing pong is bounded and local loss precedes a stale abnormal close',t=>{
  const app=setup(t);app.advance(5000);app.client.checkConnection();
  app.advance(15001);app.client.checkConnection();
  assert.equal(app.state?.status,'reconnecting');
  app.transport.onclose?.({code:1006,reason:'PRIVATE_REASON',wasClean:false});
  const loss=app.logs.findIndex(e=>e.event==='client_connection_lost');
  const cleanup=app.logs.findIndex(e=>e.event==='client_cleanup'&&e.reason==='connection_lost');
  const close=app.logs.findIndex(e=>e.event==='client_close');
  assert.ok(loss>=0&&loss<cleanup&&cleanup<close);
  assert.equal(app.logs[close].stale,true);
  assert.ok(!JSON.stringify(app.logs).includes('PRIVATE_REASON'));
});

test('token acquisition stalled before ping send has a bounded, distinguishable failure',async t=>{
  const app=setup(t);let release!:(value:string)=>void;
  app.client.accessToken=()=>new Promise(r=>{release=r;});
  app.advance(5000);app.client.checkConnection();await Promise.resolve();
  assert.equal(app.transport.sent.filter(m=>m.type==='ping').length,0);
  app.advance(15001);app.client.checkConnection();
  assert.ok(app.logs.some(e=>e.event==='client_connection_lost'&&e.reason==='ping_send_timeout'));
  release('SECRET_TOKEN');await Promise.resolve();await Promise.resolve();
  assert.equal(app.transport.sent.filter(m=>m.type==='ping').length,0);
  assert.ok(!JSON.stringify(app.logs).includes('SECRET_TOKEN'));
});
test('pong response budget starts at actual send after token acquisition',async t=>{
  const app=setup(t);let release!:(value:string)=>void;
  app.client.accessToken=()=>new Promise(r=>{release=r;});
  app.advance(5000);app.client.checkConnection();await Promise.resolve();
  app.advance(14000);release('SECRET_TOKEN');await Promise.resolve();await Promise.resolve();
  assert.equal(app.transport.sent.filter(m=>m.type==='ping').length,1);
  app.advance(2000);app.client.checkConnection();assert.equal(app.state?.status,'connected');
  app.advance(13001);app.client.checkConnection();assert.equal(app.state?.status,'reconnecting');
  assert.ok(app.logs.some(e=>e.event==='client_connection_lost'&&e.reason==='pong_timeout'));
});
test('wire connection IDs are validated, carried to stale close, and never taken from arbitrary strings',t=>{
  const app=setup(t);
  app.transport.receive({type:'connection',serverId:'PRIVATE_VALUE',connectionId:'PRIVATE_TOKEN'});
  assert.ok(!JSON.stringify(app.logs).includes('PRIVATE_'));
  const serverId='11111111-1111-4111-8111-111111111111',connectionId='22222222-2222-4222-8222-222222222222';
  app.transport.receive({type:'connection',serverId,connectionId});
  app.advance(5000);app.client.checkConnection();app.advance(15001);app.client.checkConnection();
  app.transport.onclose?.({code:1006,reason:'',wasClean:false});
  const close=app.logs.find(e=>e.event==='client_close')!;
  assert.equal(close.connectionId,connectionId);assert.equal(close.serverId,serverId);assert.equal(close.stale,true);
});
