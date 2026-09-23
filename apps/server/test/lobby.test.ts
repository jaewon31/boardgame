import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@boardgame/shared';
import { createAppServer } from '../src/http.ts';
import { attachLobby } from '../src/lobby.ts';

type Joined = Extract<ServerMessage, { type: 'joined' }>;

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
      const timeout = setTimeout(() => { this.waiting = undefined; reject(new Error(`Timed out waiting for ${type}`)); }, 2000);
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

async function setup(t: TestContext, options: Parameters<typeof attachLobby>[1] = {}) {
  const server = createAppServer();
  const lobby = attachLobby(server, options);
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
  a.send({ type: 'create', nickname: 'Another', game: 'seotda' });
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
  b.send({ type: 'create', nickname: '친구', game: 'seotda' });
  const full = await b.next('error');
  assert.equal(full.type === 'error' && full.code, 'SERVER_FULL');
  a.send({ type: 'leave' });
  await a.next('left');
  b.send({ type: 'join', code: created.room.code, nickname: '친구' });
  const missing = await b.next('error');
  assert.equal(missing.type === 'error' && missing.code, 'ROOM_NOT_FOUND');
  b.send({ type: 'create', nickname: '친구', game: 'seotda' });
  const next = await b.next('joined') as Joined;
  assert.equal(next.room.game, 'seotda');
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
