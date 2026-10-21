import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@boardgame/shared';
import { createAppServer } from '../src/http.ts';
import { attachLobby } from '../src/lobby.ts';

type Joined = Extract<ServerMessage, { type: 'joined' }>;
type RoomMessage = Extract<ServerMessage, { type: 'room' }>;

test('application heartbeat requires membership and does not change room state', async t => {
  const app=await setup(t), peer=await app.connect();
  peer.send({type:'ping',id:1});
  const denied=await peer.next('error');
  assert.equal(denied.type==='error' && denied.code,'SESSION_EXPIRED');
  await peer.create();
  peer.send({type:'ping',id:2});
  assert.deepEqual(await peer.next('pong'),{type:'pong',id:2});
});

test('only the authenticated loser can reveal and the reveal survives reconnection', async t => {
  const app=await setup(t);
  const a=await app.connect(), b=await app.connect();
  const first=await a.create();
  b.send({type:'join',code:first.room.code,nickname:'친구'});
  const second=await b.next('joined') as Joined;
  a.send({type:'startHand',previousHandId:null});
  const started=(await a.next('room',m=>m.type==='room' && !!m.room.holdem) as RoomMessage).room.holdem!;
  b.send({type:'revealCards',handId:started.id}); await b.next('error');
  a.send({type:'act',handId:started.id,revision:0,action:'allIn'});
  await b.next('room',m=>m.type==='room' && m.room.holdem?.revision===1);
  b.send({type:'act',handId:started.id,revision:1,action:'call'});
  const end=(await a.next('room',m=>m.type==='room' && m.room.holdem?.street==='complete') as RoomMessage).room.holdem!;
  const loser=end.players.find(p=>!p.revealed);
  if (!loser) { assert.ok(end.players.every(p=>p.cards?.length===2)); return; } // Split pots reveal both winners.
  const loserPeer=loser.id===first.playerId?a:b;
  const winnerPeer=loserPeer===a?b:a;
  const winnerId=loserPeer===a?second.playerId:first.playerId;
  winnerPeer.send({type:'revealCards',handId:started.id,playerId:loser.id});
  const unchanged=(await winnerPeer.next('room',m=>m.type==='room' && m.room.holdem?.street==='complete' && m.room.holdem.revision===end.revision) as RoomMessage).room.holdem!;
  assert.equal(unchanged.players.find(p=>p.id===loser.id)?.cards,null);
  loserPeer.send({type:'revealCards',handId:'old-hand'}); await loserPeer.next('error');
  loserPeer.send({type:'revealCards',handId:started.id});
  const shown=(await winnerPeer.next('room',m=>m.type==='room' && m.room.holdem?.revision===end.revision+1) as RoomMessage).room.holdem!;
  assert.equal(shown.players.find(p=>p.id===loser.id)?.cards?.length,2);
  const restored=await app.connect();
  restored.send({type:'resume',code:first.room.code,token:winnerId===first.playerId?first.token:second.token});
  const resumed=await restored.next('joined') as Joined;
  assert.equal(resumed.room.holdem?.players.find(p=>p.id===loser.id)?.cards?.length,2);
});

class Peer {
  socket: WebSocket;
  private queue: ServerMessage[] = [];
  private waiting: (() => void) | undefined;
  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on('message', data => { this.queue.push(JSON.parse(data.toString())); this.waiting?.(); });
  }
  send(value: unknown) { this.socket.send(JSON.stringify(value)); }
  async next(type: ServerMessage['type'], predicate: (value: ServerMessage) => boolean = () => true): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.waiting = undefined; reject(new Error(`Timed out waiting for ${type}: ${predicate.toString()}`)); }, 2000);
      const check = () => {
        const index = this.queue.findIndex(item => item.type === type && predicate(item));
        if (index !== -1) { clearTimeout(timeout); this.waiting = undefined; resolve(this.queue.splice(index, 1)[0]); }
      };
      this.waiting = check;
      check();
    });
  }
  async create(nickname = '방장') {
    this.send({ type: 'create', nickname, game: 'holdem' });
    return await this.next('joined') as Joined;
  }
}

test('real sockets enforce game ownership, private cards, stale actions, resume, next hand and reset', async t => {
  const app = await setup(t, { nextHandMs: 300 });
  const a = await app.connect(), b = await app.connect();
  const first = await a.create();
  b.send({ type: 'join', code: first.room.code, nickname: '친구' });
  const second = await b.next('joined') as Joined;
  b.send({ type: 'startHand', previousHandId: null });
  assert.equal((await b.next('error') as Extract<ServerMessage,{type:'error'}>).recoverable,true);
  a.send({ type: 'startHand', previousHandId: null });
  const av = (await a.next('room',m=>m.type==='room' && !!m.room.holdem) as RoomMessage).room.holdem!;
  const bv = (await b.next('room',m=>m.type==='room' && !!m.room.holdem) as RoomMessage).room.holdem!;
  assert.equal(av.players[1].cards,null); assert.equal(bv.players[0].cards,null);
  assert.equal(av.players[0].cards?.length,2); assert.equal('deck' in av,false);
  b.send({type:'act',handId:av.id,revision:0,action:'fold'});
  await b.next('error');
  const c = await app.connect();
  c.send({type:'join',code:first.room.code,nickname:'늦은친구'});
  const late=await c.next('joined') as Joined;
  assert.equal(late.room.holdem?.players.some(p=>p.id===late.playerId),false);
  c.send({type:'leave'}); await c.next('left');
  b.socket.terminate();
  await a.next('room',m=>m.type==='room' && m.room.players[1]?.connected === false);
  const resumed=await app.connect();
  resumed.send({type:'resume',code:first.room.code,token:second.token});
  const restored=await resumed.next('joined') as Joined;
  assert.deepEqual(restored.room.holdem?.players[1].cards,bv.players[1].cards);
  a.send({type:'act',handId:av.id,revision:0,action:'call'});
  const next=(await resumed.next('room',m=>m.type==='room' && m.room.holdem?.revision===1) as RoomMessage).room.holdem!;
  a.send({type:'act',handId:av.id,revision:0,action:'fold'});
  await a.next('error');
  resumed.send({type:'act',handId:av.id,revision:next.revision,action:'fold'});
  const end=(await a.next('room',m=>m.type==='room' && m.room.holdem?.street==='complete') as RoomMessage).room.holdem!;
  assert.equal(end.players.reduce((sum,p)=>sum+p.stack,0),2000);

  const secondHand=(await a.next('room',m=>m.type==='room' && m.room.holdem?.number===2) as RoomMessage).room.holdem!;
  assert.equal(secondHand.dealerId,second.playerId);
  resumed.send({type:'act',handId:secondHand.id,revision:0,action:'fold'});
  await a.next('room',m=>m.type==='room' && m.room.holdem?.number===2 && m.room.holdem.street==='complete');
  a.send({type:'resetChips',handId:secondHand.id});
  await a.next('room',m=>m.type==='room' && !m.room.holdem && m.room.players.length===2);
  a.send({type:'startHand',previousHandId:null});
  const reset=(await a.next('room',m=>m.type==='room' && m.room.holdem?.number===3) as RoomMessage).room.holdem!;
  assert.ok(reset.players.every(p=>p.stack+p.totalBet===1000));
});

test('server deadline ends an unattended hand and permits a new game', async t => {
  const app=await setup(t,{turnMs:60});
  const a=await app.connect(),b=await app.connect();
  const created=await a.create();
  b.send({type:'join',code:created.room.code,nickname:'친구'}); await b.next('joined');
  a.send({type:'startHand',previousHandId:null});
  const end=(await b.next('room',m=>m.type==='room' && m.room.holdem?.street==='complete') as RoomMessage).room.holdem!;
  assert.match(end.lastEvent,/시간 초과/);
  assert.equal(end.players.reduce((s,p)=>s+p.stack,0),2000);
});

async function setup(t: TestContext, options: Parameters<typeof attachLobby>[1] = {}) {
  const server = createAppServer();
  const lobby = attachLobby(server, { runoutMs: 5, riverSqueezeMs: 10, ...options });
  const peers: Peer[] = [];
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/lobby`;
  t.after(async () => {
    for (const peer of peers) peer.socket.terminate();
    lobby.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  return {
    url,
    async connect() {
      const peer = new Peer(url);
      peers.push(peer);
      await once(peer.socket, 'open');
      return peer;
    },
  };
}

test('two friends join the same private room; leave transfers host and never leaks tokens', async t => {
  const app = await setup(t);
  const a = await app.connect();
  const created = await a.create();
  assert.match(created.room.code, /^[A-Z2-9]{8}$/);
  const b = await app.connect();
  b.send({ type: 'join', code: created.room.code.toLowerCase(), nickname: '친구' });
  const joined = await b.next('joined') as Joined;
  const state = await a.next('room', m => m.type === 'room' && m.room.players.length === 2);
  assert.equal(state.type, 'room');
  if (state.type !== 'room') return;
  assert.deepEqual(state.room, joined.room);
  assert.equal(state.room.game, 'holdem');
  assert.equal(state.room.hostId, created.playerId);
  assert.equal(JSON.stringify(state).includes(created.token), false);
  assert.equal(JSON.stringify(joined).includes(created.token), false);
  assert.deepEqual(Object.keys(joined.room.players[0]).sort(), ['connected', 'id', 'nickname']);
  a.send({ type: 'leave' });
  const remaining = await b.next('room', m => m.type === 'room' && m.room.players.length === 1);
  if (remaining.type === 'room') assert.equal(remaining.room.hostId, joined.playerId);
});

test('rooms are isolated and unknown invite codes do not expose a room', async t => {
  const app = await setup(t);
  const a = await app.connect();
  const b = await app.connect();
  const first = await a.create();
  const second = await b.create();
  assert.notEqual(first.room.code, second.room.code);
  const c = await app.connect();
  c.send({ type: 'join', code: 'AAAAAAAA', nickname: '외부인' });
  const error = await c.next('error');
  assert.equal(error.type === 'error' && error.code, 'ROOM_NOT_FOUND');
  c.send({ type: 'join', code: second.room.code, nickname: '친구' });
  const joined = await c.next('joined') as Joined;
  assert.equal(joined.room.players.some(p => p.id === first.playerId), false);
});

test('server validates names and games and disallows duplicate names and repeated joins', async t => {
  const app = await setup(t);
  const a = await app.connect();
  for (const invalid of [null, [], { type: 'create', nickname: '  ', game: 'holdem' },
    { type: 'create', nickname: 'a'.repeat(13), game: 'holdem' },
    { type: 'create', nickname: 'abc\n', game: 'other' }, { type: 'create', nickname: 'a\u200bb', game: 'holdem' }]) {
    a.send(invalid);
    const error = await a.next('error');
    assert.equal(error.type === 'error' && error.code, 'INVALID_REQUEST');
  }
  const created = await a.create('Alice');
  a.send({ type: 'create', nickname: 'Another', game: 'holdem' });
  const already = await a.next('error');
  assert.equal(already.type === 'error' && already.code, 'ALREADY_JOINED');
  const b = await app.connect();
  b.send({ type: 'join', nickname: 'alice', code: created.room.code });
  const duplicate = await b.next('error');
  assert.equal(duplicate.type === 'error' && duplicate.code, 'NICKNAME_TAKEN');
});

test('six seats enforced including disconnected reserved seats', async t => {
  const app = await setup(t);
  const host = await app.connect();
  const created = await host.create();
  let guest: Peer | undefined;
  for (let i = 0; i < 5; i++) {
    guest = await app.connect();
    guest.send({ type: 'join', code: created.room.code, nickname: `친구${i}` });
    await guest.next('joined');
  }
  guest!.socket.terminate();
  await host.next('room', m => m.type === 'room' && m.room.players.some(p => !p.connected));
  const extra = await app.connect();
  extra.send({ type: 'join', code: created.room.code, nickname: '초과인원' });
  const error = await extra.next('error');
  assert.equal(error.type === 'error' && error.code, 'ROOM_FULL');
});

test('only a valid private session token can reclaim the same seat', async t => {
  const app = await setup(t);
  const a = await app.connect();
  const created = await a.create();
  const b = await app.connect();
  b.send({ type: 'join', code: created.room.code, nickname: '친구' });
  await b.next('joined');
  a.socket.terminate();
  await b.next('room', m => m.type === 'room' && !m.room.players[0].connected);
  const resumed = await app.connect();
  resumed.send({ type: 'resume', code: created.room.code, token: '0'.repeat(64) });
  const error = await resumed.next('error');
  assert.equal(error.type === 'error' && error.code, 'SESSION_EXPIRED');
  resumed.send({ type: 'resume', code: created.room.code, token: created.token });
  const restored = await resumed.next('joined') as Joined;
  assert.equal(restored.playerId, created.playerId);
  assert.equal(restored.room.players.length, 2);
  assert.ok(restored.room.players.every(p => p.connected));
});

test('replacing a live session does not disconnect the replacement seat', async t => {
  const app = await setup(t);
  const a = await app.connect();
  const created = await a.create();
  const closed = once(a.socket, 'close');
  const replacement = await app.connect();
  replacement.send({ type: 'resume', code: created.room.code, token: created.token });
  await replacement.next('joined');
  const [code] = await closed;
  assert.equal(code, 4001);
  const guest = await app.connect();
  guest.send({ type: 'join', nickname: '친구', code: created.room.code });
  const joined = await guest.next('joined') as Joined;
  assert.equal(joined.room.players.find(p => p.id === created.playerId)?.connected, true);
});

test('expired disconnected host is removed and host transfers to remaining friend', async t => {
  const app = await setup(t, { reconnectMs: 80 });
  const a = await app.connect();
  const created = await a.create();
  const b = await app.connect();
  b.send({ type: 'join', code: created.room.code, nickname: '친구' });
  const joined = await b.next('joined') as Joined;
  a.socket.terminate();
  const remaining = await b.next('room', m => m.type === 'room' && m.room.players.length === 1);
  if (remaining.type === 'room') assert.equal(remaining.room.hostId, joined.playerId);
  const retry = await app.connect();
  retry.send({ type: 'resume', code: created.room.code, token: created.token });
  const expired = await retry.next('error');
  assert.equal(expired.type === 'error' && expired.code, 'SESSION_EXPIRED');
});

test('last departure deletes room and released capacity can create a new room', async t => {
  const app = await setup(t, { maxRooms: 1 });
  const a = await app.connect();
  const created = await a.create();
  const b = await app.connect();
  b.send({ type: 'create', nickname: '친구', game: 'holdem' });
  const full = await b.next('error');
  assert.equal(full.type === 'error' && full.code, 'SERVER_FULL');
  a.send({ type: 'leave' });
  await a.next('left');
  b.send({ type: 'join', code: created.room.code, nickname: '친구' });
  const missing = await b.next('error');
  assert.equal(missing.type === 'error' && missing.code, 'ROOM_NOT_FOUND');
  b.send({ type: 'create', nickname: '친구', game: 'holdem' });
  const next = await b.next('joined') as Joined;
  assert.equal(next.room.game, 'holdem');
});

test('malformed JSON, binary messages and excessive requests are rejected', async t => {
  const app = await setup(t);
  const peer = await app.connect();
  peer.socket.send('{');
  assert.equal((await peer.next('error')).type, 'error');
  peer.socket.send(Buffer.from('binary'));
  assert.equal((await peer.next('error')).type, 'error');
  const closed = once(peer.socket, 'close');
  for (let i = 0; i < 30; i++) peer.send({ type: 'unknown' });
  const limited = await peer.next('error', m => m.type === 'error' && m.code === 'RATE_LIMITED');
  assert.equal(limited.type, 'error');
  assert.equal((await closed)[0], 1008);
});

test('automatic rounds preserve chips, rotate dealer, and cannot be skipped by the host', async t => {
  const app=await setup(t,{nextHandMs:100});
  const a=await app.connect(), b=await app.connect();
  const first=await a.create();
  b.send({type:'join',code:first.room.code,nickname:'친구'});
  const second=await b.next('joined') as Joined;
  a.send({type:'startHand',previousHandId:null});
  let hand=(await a.next('room',m=>m.type==='room' && m.room.holdem?.number===1) as RoomMessage).room.holdem!;
  for(let n=1;n<=3;n++) {
    const actor=hand.actorId===first.playerId?a:b;
    actor.send({type:'act',handId:hand.id,revision:hand.revision,action:'fold'});
    const result=(await a.next('room',m=>m.type==='room' && m.room.holdem?.id===hand.id && m.room.holdem.street==='complete') as RoomMessage).room;
    assert.ok(result.nextHandAt);
    assert.equal(result.fundedPlayers,2);
    assert.equal(result.holdem!.players.reduce((sum,p)=>sum+p.stack,0),2000);
    if(n===1) {
      a.send({type:'startHand',previousHandId:hand.id});
      await a.next('error');
    }
    hand=(await a.next('room',m=>m.type==='room' && m.room.holdem?.number===n+1) as RoomMessage).room.holdem!;
    assert.equal(hand.dealerId,n%2===1?second.playerId:first.playerId);
    assert.equal(hand.players.reduce((sum,p)=>sum+p.stack+p.totalBet,0),2000);
  }
});

test('countdown pauses when a funded player disconnects and resumes after reconnect', async t => {
  const app=await setup(t,{nextHandMs:120,reconnectMs:2000});
  const a=await app.connect(),b=await app.connect();
  const first=await a.create();
  b.send({type:'join',code:first.room.code,nickname:'친구'});
  const second=await b.next('joined') as Joined;
  a.send({type:'startHand',previousHandId:null});
  const hand=(await a.next('room',m=>m.type==='room' && !!m.room.holdem) as RoomMessage).room.holdem!;
  a.send({type:'act',handId:hand.id,revision:0,action:'fold'});
  await a.next('room',m=>m.type==='room' && !!m.room.nextHandAt);
  b.socket.terminate();
  const paused=(await a.next('room',m=>m.type==='room' && m.room.players[1]?.connected === false) as RoomMessage).room;
  assert.equal(paused.nextHandAt,null);
  await new Promise(r=>setTimeout(r,180));
  const resumed=await app.connect();
  resumed.send({type:'resume',code:first.room.code,token:second.token});
  const state=(await resumed.next('joined') as Joined).room;
  assert.equal(state.holdem?.number,1);
  assert.ok(state.nextHandAt);
  await a.next('room',m=>m.type==='room' && m.room.holdem?.number===2);
});

test('one remaining player cancels the countdown and reset cannot leave a stray timer', async t => {
  const app=await setup(t,{nextHandMs:120});
  const a=await app.connect(),b=await app.connect();
  const first=await a.create();
  b.send({type:'join',code:first.room.code,nickname:'친구'}); await b.next('joined');
  a.send({type:'startHand',previousHandId:null});
  const hand=(await a.next('room',m=>m.type==='room' && !!m.room.holdem) as RoomMessage).room.holdem!;
  a.send({type:'act',handId:hand.id,revision:0,action:'fold'});
  await a.next('room',m=>m.type==='room' && !!m.room.nextHandAt);
  b.send({type:'leave'}); await b.next('left');
  const stopped=(await a.next('room',m=>m.type==='room' && m.room.players.length===1 && !!m.room.holdem) as RoomMessage).room;
  assert.equal(stopped.nextHandAt,null); assert.equal(stopped.fundedPlayers,1);
  a.send({type:'resetChips',handId:hand.id});
  await a.next('room',m=>m.type==='room' && !m.room.holdem);
  await new Promise(r=>setTimeout(r,180));
  const c=await app.connect();
  c.send({type:'join',code:first.room.code,nickname:'새친구'});
  assert.equal((await c.next('joined') as Joined).room.holdem,undefined);
});

test('a busted all-in player is already public and is not dealt another hand', async t => {
  const app=await setup(t,{nextHandMs:50});
  const a=await app.connect(),b=await app.connect();
  const first=await a.create();
  b.send({type:'join',code:first.room.code,nickname:'친구'});
  const second=await b.next('joined') as Joined;
  a.send({type:'startHand',previousHandId:null});
  for(let number=1;number<=8;number++) {
    const hand=(await a.next('room',m=>m.type==='room' && m.room.holdem?.number===number && m.room.holdem.street!=='complete') as RoomMessage).room.holdem!;
    const actor=hand.actorId===first.playerId?a:b;
    const other=actor===a?b:a;
    actor.send({type:'act',handId:hand.id,revision:0,action:'allIn'});
    const raised=(await other.next('room',m=>m.type==='room' && m.room.holdem?.id===hand.id && m.room.holdem.revision===1) as RoomMessage).room.holdem!;
    other.send({type:'act',handId:hand.id,revision:raised.revision,action:'call'});
    const end=(await a.next('room',m=>m.type==='room' && m.room.holdem?.id===hand.id && m.room.holdem.street==='complete') as RoomMessage).room;
    const loser=end.holdem!.players.find(p=>p.stack===0);
    if(!loser) continue; // A tied board keeps both players in the automatic match.
    assert.equal(end.fundedPlayers,1);
    assert.equal(end.nextHandAt,null);
    assert.equal(loser.revealed,true);
    assert.equal(loser.cards?.length,2);
    const loserPeer=loser.id===first.playerId?a:b;
    loserPeer.send({type:'revealCards',handId:hand.id});
    const shown=(await a.next('room',m=>m.type==='room' && m.room.holdem?.id===hand.id && m.room.holdem.revision===end.holdem!.revision) as RoomMessage).room;
    assert.equal(shown.holdem!.players.find(p=>p.id===loser.id)?.cards?.length,2);
    assert.equal(shown.nextHandAt,null);
    await new Promise(r=>setTimeout(r,100));
    const restored=await app.connect();
    restored.send({type:'resume',code:first.room.code,token:second.token});
    assert.equal((await restored.next('joined') as Joined).room.holdem?.id,hand.id);
    return;
  }
  assert.fail('Eight consecutive all-in split pots did not produce a busted player');
});

test('real sockets receive paced streets and keep the river private across session replacement', async t => {
  const app=await setup(t,{runoutMs:40,riverSqueezeMs:1500});
  const a=await app.connect(),b=await app.connect();
  const first=await a.create();
  b.send({type:'join',code:first.room.code,nickname:'친구'});
  const second=await b.next('joined') as Joined;
  a.send({type:'startHand',previousHandId:null});
  const hand=(await a.next('room',m=>m.type==='room' && !!m.room.holdem) as RoomMessage).room.holdem!;
  a.send({type:'act',handId:hand.id,revision:0,action:'allIn'});
  await b.next('room',m=>m.type==='room' && m.room.holdem?.revision===1);
  b.send({type:'act',handId:hand.id,revision:1,action:'call'});
  for(const count of [0,3,4]) {
    const state=(await a.next('room',m=>m.type==='room' && m.room.holdem?.board.length===count && !!m.room.holdem.runout) as RoomMessage).room;
    assert.equal(state.holdem!.payouts.length,0); assert.equal(state.nextHandAt,null);
  }
  const av=(await a.next('room',m=>m.type==='room' && (m.room.holdem?.runout?.phase==='squeezing' || m.room.holdem?.street==='river')) as RoomMessage).room.holdem!;
  const bv=(await b.next('room',m=>m.type==='room' && m.room.holdem?.revision===av.revision) as RoomMessage).room.holdem!;
  if(av.runout?.phase!=='squeezing') {
    assert.equal(av.board.length,5); assert.deepEqual(av.board,bv.board); return; // A tied turn has no trailer.
  }
  const ownerIsA=av.runout.playerId===first.playerId;
  const owner=ownerIsA?a:b, other=ownerIsA?b:a;
  const privateView=ownerIsA?av:bv, publicView=ownerIsA?bv:av;
  assert.ok(privateView.runout?.card); assert.equal(publicView.runout?.card,null);
  assert.equal(publicView.board.length,4);
  other.send({type:'revealRiver',handId:hand.id}); await other.next('error');
  owner.send({type:'revealRiver',handId:'old-hand'}); await owner.next('error');
  const replacement=await app.connect();
  replacement.send({type:'resume',code:first.room.code,token:ownerIsA?first.token:second.token});
  const restored=(await replacement.next('joined') as Joined).room.holdem!;
  assert.equal(restored.runout?.card,privateView.runout?.card);
  assert.equal(restored.runout?.deadline,privateView.runout?.deadline);
  replacement.send({type:'revealRiver',handId:hand.id});
  const visible=(await other.next('room',m=>m.type==='room' && m.room.holdem?.street==='river') as RoomMessage).room.holdem!;
  assert.equal(visible.board[4],privateView.runout?.card); assert.equal(visible.payouts.length,0);
  await other.next('room',m=>m.type==='room' && m.room.holdem?.street==='complete');
});


test('host settings control every hand, late entry and reset; results count finished hands once', async t => {
  const app=await setup(t,{nextHandMs:10000});
  const a=await app.connect(), b=await app.connect();
  const settings={startingChips:5000,smallBlind:25,bigBlind:50,turnSeconds:45};
  a.send({type:'create',nickname:'A',game:'holdem',settings});
  const first=await a.next('joined') as Joined;
  assert.deepEqual(first.room.settings,settings);
  b.send({type:'join',nickname:'B',code:first.room.code}); const second=await b.next('joined') as Joined;
  b.send({type:'updateSettings',settings:{...settings,turnSeconds:10}}); await b.next('error');
  const updated={...settings,startingChips:6000,turnSeconds:60};
  a.send({type:'updateSettings',settings:updated});
  await a.next('room',m=>m.type==='room' && m.room.settings?.turnSeconds===60);
  a.send({type:'startHand',previousHandId:null});
  const hand=(await a.next('room',m=>m.type==='room' && !!m.room.holdem) as RoomMessage).room.holdem!;
  assert.ok(hand.players.every(p=>p.stack+p.totalBet===6000));
  assert.equal(hand.smallBlind,25);assert.equal(hand.bigBlind,50);assert.equal(hand.legal?.minRaiseTo,100);
  assert.ok(hand.deadline! > Date.now()+58000 && hand.deadline! <= Date.now()+60000);
  a.send({type:'updateSettings',settings});await a.next('error');
  const c=await app.connect();c.send({type:'join',nickname:'C',code:first.room.code});await c.next('joined');
  a.send({type:'act',handId:hand.id,revision:hand.revision,action:'fold'});
  const result=(await a.next('room',m=>m.type==='room' && m.room.holdem?.street==='complete') as RoomMessage).room;
  assert.equal(result.todayResults?.players.length,2);
  assert.deepEqual(result.todayResults?.players.map(p=>[p.playerId,p.hands,p.wins,p.netChips]),[[first.playerId,1,0,-25],[second.playerId,1,1,25]]);
  assert.equal(JSON.stringify(result.todayResults).includes('cards'),false);
  b.socket.terminate();
  const repeat=(await a.next('room',m=>m.type==='room' && m.room.players.some(p=>p.id===second.playerId && !p.connected)) as RoomMessage).room;
  const rb=await app.connect();rb.send({type:'resume',code:first.room.code,token:second.token});await rb.next('joined');
  assert.deepEqual(repeat.todayResults,result.todayResults);
  a.send({type:'resetChips',handId:hand.id});
  const reset=(await a.next('room',m=>m.type==='room' && !m.room.holdem && m.room.todayResults?.players.length===2) as RoomMessage).room;
  assert.deepEqual(reset.todayResults,result.todayResults);
  a.send({type:'startHand',previousHandId:null});
  const next=(await a.next('room',m=>m.type==='room' && m.room.holdem?.number===2) as RoomMessage).room.holdem!;
  assert.equal(next.players.length,3);assert.ok(next.players.every(p=>p.stack+p.totalBet===6000));
});

test('malformed settings cannot create or change a room', async t=>{
  const app=await setup(t), a=await app.connect();
  for(const settings of [null, [], {startingChips:1000,smallBlind:20,bigBlind:10,turnSeconds:30}, {startingChips:1000,smallBlind:10,bigBlind:200,turnSeconds:30}, {startingChips:1000,smallBlind:10,bigBlind:20,turnSeconds:0}, {startingChips:'1000',smallBlind:10,bigBlind:20,turnSeconds:30}]) {
    a.send({type:'create',nickname:'A',game:'holdem',settings}); await a.next('error');
  }
  const room=await a.create();assert.equal(room.room.settings?.startingChips,1000);
});

test('verified account cannot occupy two seats; revoked sessions cannot act or reclaim another account seat',async t=>{
 let revoked=false;
 const app=await setup(t,{authorize:async token=>token==='account-a'&&!revoked?'a':token==='account-b'?'b':null});
 const a=await app.connect();a.send({type:'create',game:'holdem',nickname:'A',accessToken:'account-a'});
 const first=await a.next('joined') as Joined;
 const b=await app.connect();b.send({type:'join',code:first.room.code,nickname:'A2',accessToken:'account-a'});
 assert.equal((await b.next('error') as Extract<ServerMessage,{type:'error'}>).code,'ALREADY_JOINED');
 const thief=await app.connect();thief.send({type:'resume',code:first.room.code,token:first.token,accessToken:'account-b'});
 assert.equal((await thief.next('error') as Extract<ServerMessage,{type:'error'}>).code,'SESSION_EXPIRED');
 revoked=true;a.send({type:'startHand',previousHandId:null,accessToken:'account-a'});
 assert.equal((await a.next('error') as Extract<ServerMessage,{type:'error'}>).code,'AUTH_REQUIRED');
 const invalid=await app.connect();invalid.send({type:'create',game:'holdem',nickname:'X'});
 assert.equal((await invalid.next('error') as Extract<ServerMessage,{type:'error'}>).code,'AUTH_REQUIRED');
});

test('new login retires the previous account seat without waiting for reconnect expiry',async t=>{
 const app=await setup(t,{authorize:async token=>token==='old'||token==='new'?{accountId:'same',sessionId:token}:null});
 const a=await app.connect();a.send({type:'create',game:'holdem',nickname:'A',accessToken:'old'});
 await a.next('joined');
 const closed=once(a.socket,'close');
 const b=await app.connect();b.send({type:'create',game:'holdem',nickname:'A',accessToken:'new'});
 assert.equal((await b.next('joined') as Joined).room.players.length,1);
 assert.equal((await closed)[0],4003);
});
