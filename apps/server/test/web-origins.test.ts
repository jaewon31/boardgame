import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { createAppServer } from '../src/http.ts';
import { attachLobby } from '../src/lobby.ts';
import { parseOrigins, allowedOrigin } from '../src/origins.ts';

const origin='http://localhost:8087';
test('origin configuration rejects globs, null, paths and insecure production values',()=>{
  for(const invalid of ['*','null','https://app.test/','https://app.test/path','https://user:pass@app.test','https://app.test?x=1'])assert.throws(()=>parseOrigins(invalid));
  assert.throws(()=>parseOrigins(origin,true));
  assert.deepEqual(parseOrigins('https://app.test,https://app.test',true),['https://app.test']);
  assert.equal(allowedOrigin(undefined,[]),true);
  for(const denied of ['null','',origin+'.evil','http://localhost:8088'])assert.equal(allowedOrigin(denied,[origin]),false);
});
test('HTTP preflight is bounded and never replaces API authentication; error responses include CORS',async t=>{
  let calls=0;
  const server=createAppServer(()=>true,async(_req,res)=>{calls++;res.writeHead(401);res.end('unauthorized');return true;},[origin]);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/friends/11111111-1111-4111-8111-111111111111/stats`;
  const headers={Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'};
  const preflight=await fetch(url,{method:'OPTIONS',headers});assert.equal(preflight.status,204);assert.equal(calls,0);
  assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
  assert.equal(preflight.headers.get('access-control-allow-credentials'),null);
  assert.equal(preflight.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(url,{headers:{Origin:origin}})).status,401);assert.equal(calls,1);
  const unavailable=createAppServer(()=>false,async()=>true,[origin]);
  unavailable.listen(0,'127.0.0.1');await once(unavailable,'listening');t.after(()=>{unavailable.closeAllConnections();unavailable.close();});
  const error=await fetch(`http://127.0.0.1:${(unavailable.address() as AddressInfo).port}/health`,{headers:{Origin:origin}});
  assert.equal(error.status,503);assert.equal(error.headers.get('access-control-allow-origin'),origin);
  for(const denied of ['null','http://evil.test','http://localhost:8088'])assert.equal((await fetch(url,{headers:{Origin:denied}})).status,403);
  assert.equal((await fetch(url,{method:'OPTIONS',headers:{...headers,'Access-Control-Request-Method':'POST'}})).status,403);
  assert.equal((await fetch(url,{method:'OPTIONS',headers:{...headers,'Access-Control-Request-Headers':'x-unsafe'}})).status,403);
  assert.equal((await fetch(url)).status,401); // Native still reaches authentication.
});
test('WS rejects bad origins before application handling; permitted/native sockets still need a valid token',async t=>{
  const server=createAppServer(), sockets:WebSocket[]=[];
  const lobby=attachLobby(server,{allowedOrigins:[origin],authorize:async()=>null,diagnostic:()=>{}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{sockets.forEach(s=>s.terminate());lobby.close();server.close();});
  const url=`ws://127.0.0.1:${(server.address() as AddressInfo).port}/lobby`;
  for(const denied of ['null','http://evil.test',origin+'.evil'])await new Promise<void>((resolve,reject)=>{
    const ws=new WebSocket(url,{origin:denied});sockets.push(ws);
    ws.on('open',()=>reject(new Error('Unexpected accepted Origin')));
    ws.on('unexpected-response',(_req,res)=>{assert.equal(res.statusCode,401);res.resume();ws.terminate();resolve();});ws.on('error',()=>{});
  });
  for(const allowed of [origin,undefined]) {
    const ws=new WebSocket(url,allowed?{origin:allowed}:{});sockets.push(ws);await once(ws,'open');
    const rejected=new Promise<void>(resolve=>ws.on('message',raw=>{const msg=JSON.parse(String(raw));if(msg.type==='error'){assert.equal(msg.code,'AUTH_REQUIRED');resolve();}}));
    ws.send(JSON.stringify({type:'currentRoom',accountId:'someone-else',accessToken:'invalid'}));await rejected;
  }
});
