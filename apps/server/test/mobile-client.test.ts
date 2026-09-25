import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { WebSocketServer, type WebSocket } from 'ws';
import type { LobbyRoom } from '@boardgame/shared';
import { RoomClient, type RoomState } from '../../mobile/src/services/RoomClient.ts';
import { HoldemHand } from '../src/holdem/hand.ts';

const room: LobbyRoom = {
  code: 'ABCD2345', game: 'holdem', hostId: 'me', maxPlayers: 6,
  players: [{ id: 'me', nickname: '나', connected: true }],
};

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

async function setup(t: TestContext, handler: (socket: WebSocket, message: Record<string, unknown>) => void) {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  wss.on('connection', socket => socket.on('message', raw => handler(socket, JSON.parse(raw.toString()))));
  await once(wss, 'listening');
  const state = stateObserver();
  const client = new RoomClient(`ws://127.0.0.1:${(wss.address() as AddressInfo).port}`, state.notify);
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
  const state = await app.state.wait(s => s.status === 'idle' && !!s.error);
  assert.equal(state.room, null);
  assert.equal(state.error, '다시 입장해 주세요.');
});

test('leaving during reconnect cancels retry and cannot restore stale membership', async t => {
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
  assert.equal(requests, 1);
  assert.equal(app.state.current()?.status, 'idle');
  assert.equal(app.state.current()?.room, null);
});
