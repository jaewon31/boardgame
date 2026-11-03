import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { WebSocketServer, type WebSocket } from 'ws';
import type { LobbyRoom } from '@boardgame/shared';
import { RoomClient, type RoomState } from '../../mobile/src/services/RoomClient.ts';
import { HoldemHand } from '../src/holdem/hand.ts';

const room: LobbyRoom = {
  settingsRevision: 0, code: 'ABCD2345', game: 'holdem', hostId: 'me', maxPlayers: 6,
  players: [{ id: 'me', nickname: '나', connected: true }],
};

test('unresponsive OPEN socket is replaced and the same seat resumes', async t => {
  let resumes=0;
  const app=await setup(t,(socket,message)=>{
    if(message.type==='ping') {
      if(resumes) socket.send(JSON.stringify({type:'pong',id:message.id}));
      return; // Keep the first transport open without answering application messages.
    }
    if(message.type==='resume'){resumes++;assert.equal(message.token,'secret');}
    socket.send(JSON.stringify({type:'joined',room,playerId:'me',token:'secret'}));
  },{heartbeatMs:20,heartbeatTimeoutMs:100,retryMs:10});
  app.client.enter({type:'create',nickname:'나',game:'holdem'});
  await app.state.wait(s=>s.status==='connected');
  await app.state.wait(s=>s.status==='reconnecting');
  const restored=await app.state.wait(s=>s.status==='connected');
  assert.equal(resumes,1); assert.equal(restored.playerId,'me');
  await new Promise(resolve=>setTimeout(resolve,240));
  assert.equal(resumes,1); assert.equal(app.state.current()?.status,'connected');
});

test('wrong heartbeat IDs do not conceal a dead session; offline leave preserves membership', async t => {
  let requests=0;
  const app=await setup(t,(socket,message)=>{
    if(message.type==='ping'){socket.send(JSON.stringify({type:'pong',id:-1}));return;}
    if(message.type==='leave')return;
    requests++; socket.send(JSON.stringify({type:'joined',room,playerId:'me',token:'secret'}));
  },{heartbeatMs:20,heartbeatTimeoutMs:100,retryMs:150});
  app.client.enter({type:'create',nickname:'나',game:'holdem'});
  await app.state.wait(s=>s.status==='reconnecting');
  app.client.leave();
  await new Promise(resolve=>setTimeout(resolve,220));
  assert.equal(requests,2); assert.ok(app.state.current()?.room);
});

test('game commands carry hand version and recoverable errors keep membership', async t => {
  const hand = new HoldemHand([{ id: 'me', nickname: '나', stack: 1000 }, { id: 'friend', nickname: '친구', stack: 1000 }]);
  const gameRoom = { ...room, holdem: hand.viewFor('me') };
  let received: Record<string, unknown> | undefined;
  const app = await setup(t, (socket, message) => {
    if (message.type === 'create') socket.send(JSON.stringify({ type: 'joined', room: gameRoom, playerId: 'me', token: 'secret' }));
    else { received = message; socket.send(JSON.stringify({ type: 'error', code: 'GAME_ERROR', recoverable: true, message: '잘못된 행동' })); }
  });
  app.client.enter({type:'create',nickname:'나',game:'holdem'});
  await app.state.wait(s=>s.status==='connected');
  app.client.act('raise',100);
  const state = await app.state.wait(s=>!!s.error);
  assert.equal(state.status,'connected'); assert.equal(state.room?.code,room.code);
  assert.deepEqual(received,{type:'act',handId:hand.id,revision:0,action:'raise',amount:100});
  app.client.revealRiver(hand.id);
  await app.state.wait(s=>!!s.error);
  assert.deepEqual(received,{type:'revealRiver',handId:hand.id});
});

function stateObserver() {
  let latest: RoomState | undefined;
  let listener: (() => void) | undefined;
  return {
    notify(state: RoomState) { latest = state; listener?.(); },
    current() { return latest; },
    wait(predicate: (state: RoomState) => boolean) {
      return new Promise<RoomState>((resolve, reject) => {
        const timeout = setTimeout(() => { listener = undefined; reject(new Error('Client state timeout')); }, 4000);
        const check = () => {
          if (latest && predicate(latest)) { clearTimeout(timeout); listener = undefined; resolve(latest); }
        };
        listener = check;
        check();
      });
    },
  };
}

async function setup(t: TestContext, handler: (socket: WebSocket, message: Record<string, unknown>) => void, timing: ConstructorParameters<typeof RoomClient>[2] = {}) {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  wss.on('connection', socket => socket.on('message', raw => handler(socket, JSON.parse(raw.toString()))));
  await once(wss, 'listening');
  const state = stateObserver();
  const client = new RoomClient(`ws://127.0.0.1:${(wss.address() as AddressInfo).port}`, state.notify, timing);
  t.after(async () => {
    client.dispose();
    for (const socket of wss.clients) socket.terminate();
    await new Promise<void>(resolve => wss.close(() => resolve()));
  });
  return { client, state };
}

test('mobile client accepts server membership, ignores duplicate entry and receives live updates', async t => {
  let requests = 0;
  const app = await setup(t, (socket, message) => {
    if (message.type === 'leave') { socket.send(JSON.stringify({type:'left'})); return; }
    if (message.type !== 'create') return;
    requests++;
    socket.send(JSON.stringify({ type: 'joined', room, playerId: 'me', token: 'private-token' }));
    socket.send(JSON.stringify({ type: 'room', room: { ...room, players: [...room.players, { id: 'friend', nickname: '친구', connected: true }] } }));
  });
  app.client.enter({ type: 'create', nickname: '나', game: 'holdem' });
  app.client.enter({ type: 'create', nickname: '중복', game: 'holdem' });
  const state = await app.state.wait(s => s.room?.players.length === 2);
  assert.equal(state.status, 'connected');
  assert.equal(state.playerId, 'me');
  assert.equal(JSON.stringify(state).includes('private-token'), false);
  assert.equal(requests, 1);
  app.client.leave();
  await app.state.wait(s=>s.status==='idle');
  assert.equal(app.state.current()?.status, 'idle');
  assert.equal(app.state.current()?.room, null);
});

test('mobile client resumes with private token after dropped transport', async t => {
  let transport: WebSocket | undefined;
  let resumed = false;
  const app = await setup(t, (socket, message) => {
    transport = socket;
    if (message.type === 'resume') {
      assert.equal(message.code, room.code);
      assert.equal(message.token, 'secret');
      resumed = true;
    }
    socket.send(JSON.stringify({ type: 'joined', room, playerId: 'me', token: 'secret' }));
  });
  app.client.enter({ type: 'create', nickname: '나', game: 'holdem' });
  await app.state.wait(s => s.status === 'connected');
  transport!.terminate();
  await app.state.wait(s => s.status === 'reconnecting');
  const restored = await app.state.wait(s => s.status === 'connected');
  assert.equal(resumed, true);
  assert.equal(restored.playerId, 'me');
});

test('expired resume returns to entry screen with useful error', async t => {
  let transport: WebSocket | undefined;
  const app = await setup(t, (socket, message) => {
    transport = socket;
    socket.send(JSON.stringify(message.type === 'resume'
      ? { type: 'error', code: 'SESSION_EXPIRED', message: '다시 입장해 주세요.' }
      : { type: 'joined', room, playerId: 'me', token: 'secret' }));
  });
  app.client.enter({ type: 'create', nickname: '나', game: 'holdem' });
  await app.state.wait(s => s.status === 'connected');
  transport!.terminate();
  const state = await app.state.wait(s => s.status === 'error' && !!s.error);
  assert.equal(state.room, null);
  assert.equal(state.error, '다시 입장해 주세요.');
});

test('leaving during reconnect preserves the seat until explicit online leave', async t => {
  let transport: WebSocket | undefined;
  let requests = 0;
  const app = await setup(t, (socket) => {
    requests++;
    transport = socket;
    socket.send(JSON.stringify({ type: 'joined', room, playerId: 'me', token: 'secret' }));
  });
  app.client.enter({ type: 'create', nickname: '나', game: 'holdem' });
  await app.state.wait(s => s.status === 'connected');
  transport!.terminate();
  await app.state.wait(s => s.status === 'reconnecting');
  app.client.leave();
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(requests, 2);
  assert.equal(app.state.current()?.status, 'connected');
  assert.equal(app.state.current()?.room?.code, room.code);
});

test('account token refresh is sent on heartbeat and leave; leaving waits for the authenticated send',async t=>{
 const received:Record<string,unknown>[]=[];
 const app=await setup(t,(socket,message)=>{
   received.push(message);
   if(message.type==='currentRoom')socket.send(JSON.stringify({type:'noRoom'}));
   if(message.type==='leave')socket.send(JSON.stringify({type:'left'}));
   if(message.type==='create')socket.send(JSON.stringify({type:'joined',room,playerId:'me',token:'secret'}));
   if(message.type==='ping')socket.send(JSON.stringify({type:'pong',id:message.id}));
 });
 let token='login-one';app.client.accessToken=async()=>token;
 app.client.enter({type:'create',nickname:'나',game:'holdem'});
 await app.state.wait(s=>s.status==='connected');
 assert.equal(received[0].accessToken,'login-one');
 token='refreshed-token';app.client.checkConnection();
 await new Promise(resolve=>setTimeout(resolve,40));
 assert.equal(received.find(m=>m.type==='ping')?.accessToken,'refreshed-token');
 app.client.leave();await new Promise(resolve=>setTimeout(resolve,40));
 assert.equal(received.find(m=>m.type==='leave')?.accessToken,'refreshed-token');
 assert.equal(app.state.current()?.status,'idle');
});

test('account lookup restores without local token; preflight avoids create and duplicate clicks', async t => {
  const received:string[]=[];
  const app=await setup(t,(socket,m)=>{
    received.push(String(m.type));
    assert.equal(m.accessToken,'account');
    socket.send(JSON.stringify({type:'joined',room,playerId:'me',token:'secret'}));
  });
  app.client.accessToken=async()=>'account';
  app.client.enter({type:'create',game:'holdem',nickname:'나'});
  app.client.enter({type:'create',game:'holdem',nickname:'나'});
  await app.state.wait(s=>s.status==='connected');
  assert.deepEqual(received,['currentRoom']);
  app.client.enter({type:'create',game:'holdem',nickname:'나'});
  assert.deepEqual(received,['currentRoom']);
});

test('authenticated relaunch ignores missing storage and reconciles deleted rooms', async t => {
  let exists=true;
  const app=await setup(t,(socket,m)=>{
    assert.equal(m.type,'currentRoom');
    socket.send(JSON.stringify(exists?{type:'joined',room,playerId:'me',token:'secret'}:{type:'noRoom'}));
  });
  app.client.accessToken=async()=>'account';
  await app.client.restore();await app.state.wait(s=>s.status==='connected');
  exists=false;app.client.cancel();app.client.refresh();
  await app.state.wait(s=>s.status==='idle' && !s.room);
});

test('leave retains membership until server acknowledgement and ignores repeated clicks',async t=>{
  let transport:WebSocket|undefined,leaves=0;
  const app=await setup(t,(socket,m)=>{
    transport=socket;
    if(m.type==='create')socket.send(JSON.stringify({type:'joined',room,playerId:'me',token:'secret'}));
    if(m.type==='leave')leaves++;
  });
  app.client.enter({type:'create',game:'holdem',nickname:'나'});await app.state.wait(s=>s.status==='connected');
  app.client.leave();app.client.leave();
  assert.equal(app.state.current()?.room?.code,room.code);
  await new Promise(r=>setTimeout(r,30));assert.equal(leaves,1);
  transport!.send(JSON.stringify({type:'left'}));await app.state.wait(s=>s.status==='idle');
  assert.equal(app.state.current()?.room,null);
});

test('settings rejection retains authoritative values; success waits for server acknowledgement',async t=>{
  const old={startingChips:1000,smallBlind:10,bigBlind:20,turnSeconds:30};
  const next={...old,turnSeconds:60};let fail=true;
  const app=await setup(t,(socket,m)=>{
    if(m.type==='create')socket.send(JSON.stringify({type:'joined',room:{...room,settings:old},playerId:'me',token:'secret'}));
    if(m.type==='updateSettings')socket.send(JSON.stringify(fail?{type:'error',code:'GAME_ERROR',recoverable:true,message:'저장 실패'}:{type:'settingsUpdated',settings:next,settingsRevision:1,requestId:m.requestId}));
  });
  app.client.enter({type:'create',game:'holdem',nickname:'나'});await app.state.wait(s=>s.status==='connected');
  await assert.rejects(app.client.updateSettings(next),/저장 실패/);
  assert.deepEqual(app.state.current()?.room?.settings,old);
  fail=false;const saving=app.client.updateSettings(next);
  await assert.rejects(app.client.updateSettings(next),/저장하고/);
  await saving;assert.deepEqual(app.state.current()?.room?.settings,next);
});

test('stale preflight race recovers ALREADY_JOINED without a second create',async t=>{
 let lookups=0,creates=0;
 const app=await setup(t,(socket,m)=>{
   if(m.type==='currentRoom')socket.send(JSON.stringify(++lookups===1?{type:'noRoom'}:{type:'joined',room,playerId:'me',token:'secret'}));
   if(m.type==='create'){creates++;socket.send(JSON.stringify({type:'error',code:'ALREADY_JOINED',message:'이미 참여 중'}));}
 });
 app.client.accessToken=async()=>'account';
 app.client.enter({type:'create',game:'holdem',nickname:'나'});
 await app.state.wait(s=>s.status==='connected');assert.equal(creates,1);assert.equal(lookups,2);
});

test('authenticated reconnect rechecks server membership after transport loss',async t=>{
 let transport:WebSocket|undefined,lookups=0;
 const app=await setup(t,(socket,m)=>{
   transport=socket;
   if(m.type==='currentRoom'){lookups++;socket.send(JSON.stringify({type:'joined',room,playerId:'me',token:'secret'}));}
 },{retryMs:10});
 app.client.accessToken=async()=>'account';await app.client.restore();await app.state.wait(s=>s.status==='connected');
 transport!.terminate();await app.state.wait(s=>s.status==='reconnecting');await app.state.wait(s=>s.status==='connected');
 assert.equal(lookups,2);assert.equal(app.state.current()?.playerId,'me');
});

test('room phase separates failed lookup, checking, confirmed absence and same-account snapshots',async()=>{
 const {roomPhase,roomStateForAccount}=await import('../../mobile/src/services/roomView.ts');
 const state:RoomState={status:'connected',room,playerId:'me',error:null};
 const owned={accountId:'a',state};
 assert.equal(roomPhase(state),'IN_LOBBY');
 assert.equal(roomStateForAccount('a',owned).room,room);
 for(const account of ['b',null]){
   const visible=roomStateForAccount(account,owned);
   assert.equal(visible.room,null);assert.equal(visible.playerId,null);
 }
 assert.equal(roomPhase(roomStateForAccount('b',owned)),'CHECKING_ROOM');
 assert.equal(roomPhase({...state,room:null,status:'error'}),'ERROR');
 assert.equal(roomPhase({...state,room:null,status:'idle'}),'NO_ROOM');
 assert.equal(roomPhase({...state,status:'reconnecting'}),'RECONNECTING');
 const hand=new HoldemHand([{id:'me',nickname:'나',stack:1000},{id:'other',nickname:'친구',stack:1000}]);
 assert.equal(roomPhase({...state,room:{...room,holdem:hand.viewFor('me')}}),'IN_GAME');
});

test('failed account lookup never reports NO_ROOM; bounded retries and explicit retry recover',async t=>{
 let fail=true,lookups=0;
 const app=await setup(t,(socket,m)=>{
   if(m.type==='currentRoom'){lookups++;socket.send(JSON.stringify(fail?{type:'error',code:'AUTH_UNAVAILABLE',message:'unavailable'}:{type:'noRoom'}));}
 },{retryMs:10,retryWindowMs:60});
 app.client.accessToken=async()=>'a';await app.client.restore();
 const failed=await app.state.wait(s=>s.status==='disconnected');assert.ok(failed.error);assert.equal(failed.notice,undefined);assert.ok(lookups>1);
 fail=false;app.client.refresh();await app.state.wait(s=>s.status==='idle');assert.equal(app.state.current()?.room,null);
});

test('refreshes during one lookup are coalesced; late replaced socket responses are ignored',async t=>{
 const connections:WebSocket[]=[];let requests=0;
 const app=await setup(t,(socket,m)=>{if(m.type==='currentRoom'){requests++;connections.push(socket);}});
 app.client.accessToken=async()=>'a';await app.client.restore();app.client.refresh();app.client.refresh();
 while(connections.length<1)await new Promise(r=>setTimeout(r,5));
 assert.equal(requests,1);
 // Capture the native callback to simulate an already queued old event after cancellation.
 const old=(app.client as unknown as {socket:globalThis.WebSocket}).socket.onmessage!;
 app.client.cancel();app.client.refresh();
 while(connections.length<2)await new Promise(r=>setTimeout(r,5));
 old.call(null as never,{data:JSON.stringify({type:'joined',room,playerId:'old',token:'secret'})} as MessageEvent);
 assert.equal(app.state.current()?.room,null);
 connections[1].send(JSON.stringify({type:'noRoom'}));await app.state.wait(s=>s.status==='idle');
});

test('disposed account client cannot send a delayed authentication result',async t=>{
 let release!:(token:string)=>void;
 const received:unknown[]=[];const app=await setup(t,(_socket,m)=>received.push(m));
 app.client.accessToken=()=>new Promise(r=>{release=r;});await app.client.restore();
 while(!release)await new Promise(r=>setTimeout(r,5));
 app.client.dispose();const before=app.state.current();release('previous-account');
 await new Promise(r=>setTimeout(r,20));assert.equal(received.length,0);assert.equal(app.state.current(),before);
});

test('only authoritative noRoom distinguishes room closure from membership expiry',async t=>{
 let answer:'room-closed'|'membership-ended'|null=null;
 const app=await setup(t,(socket,m)=>{
   if(m.type==='currentRoom')socket.send(JSON.stringify(answer?{type:'noRoom',reason:answer}:{type:'joined',room,playerId:'me',token:'secret'}));
 });
 app.client.accessToken=async()=>'a';await app.client.restore();await app.state.wait(s=>s.status==='connected');
 app.client.cancel();assert.equal(app.state.current()?.notice,undefined);assert.equal(app.state.current()?.room?.code,room.code);
 answer='membership-ended';app.client.refresh();await app.state.wait(s=>s.status==='idle');assert.equal(app.state.current()?.notice,'membership-ended');
 app.client.clearNotice();assert.equal(app.state.current()?.notice,undefined);
 answer='room-closed';app.client.refresh();await app.state.wait(s=>s.status==='idle');assert.equal(app.state.current()?.notice,'room-closed');
});

test('settings acknowledgement must match pending request and cannot roll back newer settings',async t=>{
 let transport:WebSocket|undefined,requestId='';
 const initial={startingChips:1000,smallBlind:10,bigBlind:20,turnSeconds:30}, next={...initial,turnSeconds:60};
 const app=await setup(t,(socket,m)=>{
   transport=socket;
   if(m.type==='create')socket.send(JSON.stringify({type:'joined',room:{...room,settings:initial},playerId:'me',token:'secret'}));
   if(m.type==='updateSettings'){assert.equal(m.expectedRevision,0);requestId=String(m.requestId);}
 });
 app.client.enter({type:'create',game:'holdem',nickname:'나'});await app.state.wait(s=>s.status==='connected');
 let done=false;const saving=app.client.updateSettings(next,0).then(()=>{done=true;});
 while(!requestId)await new Promise(r=>setTimeout(r,5));
 transport!.send(JSON.stringify({type:'settingsUpdated',requestId:'old',settings:initial,settingsRevision:0}));
 transport!.send(JSON.stringify({type:'room',room:{...room,settings:next,settingsRevision:2}}));
 await app.state.wait(s=>s.room?.settingsRevision===2);assert.equal(done,false);
 transport!.send(JSON.stringify({type:'settingsUpdated',requestId,settings:initial,settingsRevision:1}));
 await saving;assert.deepEqual(app.state.current()?.room?.settings,next);assert.equal(app.state.current()?.room?.settingsRevision,2);
 transport!.send(JSON.stringify({type:'room',room:{...room,settings:initial,settingsRevision:0}}));
 await new Promise(r=>setTimeout(r,20));assert.deepEqual(app.state.current()?.room?.settings,next);
});

test('settings timeout reconciles server result instead of accepting a late acknowledgement',async t=>{
 const initial={startingChips:1000,smallBlind:10,bigBlind:20,turnSeconds:30}, next={...initial,turnSeconds:60};let lookups=0;
 const app=await setup(t,(socket,m)=>{
   if(m.type==='currentRoom')socket.send(JSON.stringify({type:'joined',room:{...room,settings:++lookups===1?initial:next,settingsRevision:lookups-1},playerId:'me',token:'secret'}));
 },{commandTimeoutMs:30,retryMs:10});
 app.client.accessToken=async()=>'a';await app.client.restore();await app.state.wait(s=>s.status==='connected');
 await assert.rejects(app.client.updateSettings(next),/저장 응답/);
 await app.state.wait(s=>s.status==='connected'&&s.room?.settingsRevision===1);
 assert.deepEqual(app.state.current()?.room?.settings,next);
});
