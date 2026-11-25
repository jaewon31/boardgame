import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { WebSocket } from 'ws';
import type { LobbyRoom, ServerMessage } from '@boardgame/shared';
import { createAppServer } from '../src/http.ts';
import { attachLobby, type LobbyCheckpoint } from '../src/lobby.ts';
import { cancelSeatRequest, requestSeat, resolveSeatRequest, type SeatRoom } from '../src/seating.ts';

// Seat selection and host approval on the default (production) path: no autoSeat.
type Joined = Extract<ServerMessage, { type: 'joined' }>;
type RoomMessage = Extract<ServerMessage, { type: 'room' }>;
type ErrorMessage = Extract<ServerMessage, { type: 'error' }>;

class Peer {
  socket: WebSocket;
  queue: ServerMessage[] = [];
  private waiting: (() => void) | undefined;
  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on('message', data => { this.queue.push(JSON.parse(data.toString())); this.waiting?.(); });
  }
  send(value: unknown) { this.socket.send(JSON.stringify(value)); }
  next(type: ServerMessage['type'], predicate: (value: ServerMessage) => boolean = () => true): Promise<ServerMessage> {
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
  async room(predicate: (room: LobbyRoom) => boolean) {
    return (await this.next('room', m => m.type === 'room' && predicate(m.room)) as RoomMessage).room;
  }
  async error() { return await this.next('error') as ErrorMessage; }
  async create(nickname = '방장') { this.send({ type: 'create', nickname, game: 'holdem' }); return await this.next('joined') as Joined; }
  async join(code: string, nickname: string) { this.send({ type: 'join', code, nickname }); return await this.next('joined') as Joined; }
}

function memoryStore(initial: LobbyCheckpoint | null = null) {
  return { saved: initial, load() { return this.saved; }, save(value: LobbyCheckpoint) { this.saved = structuredClone(value); } };
}

async function setup(t: TestContext, options: Parameters<typeof attachLobby>[1] = {}) {
  const server = createAppServer();
  const lobby = attachLobby(server, { runoutMs: 5, riverSqueezeMs: 10, nextHandMs: 30, ...options });
  const peers: Peer[] = [];
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/lobby`;
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    for (const peer of peers) peer.socket.terminate();
    lobby.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  };
  t.after(close);
  return {
    lobby, close,
    async connect() { const peer = new Peer(url); peers.push(peer); await once(peer.socket, 'open'); return peer; },
  };
}
const seatOf = (room: LobbyRoom, id: string) => room.players.find(p => p.id === id)?.seat;
/** The host picks a seat like everyone else, but without approval. */
async function hostSits(peer: Peer, hostId: string, seat = 0, extra: Record<string, unknown> = {}) {
  peer.send({ type: 'requestSeat', seat, ...extra });
  return await peer.room(r => seatOf(r, hostId) === seat);
}

test('the host also starts unseated and sits instantly on a chosen seat; joiners need approval and everyone sees the request', async t => {
  const app = await setup(t);
  const a = await app.connect(), b = await app.connect(), c = await app.connect();
  const host = await a.create();
  assert.equal(seatOf(host.room, host.playerId), null, 'no automatic seat for the host');
  const hostSeated = await hostSits(a, host.playerId, 5);
  assert.deepEqual(hostSeated.seatRequests, [], 'the host never queues a request');
  assert.equal(hostSeated.players.filter(p => p.seat !== null).length, 1);
  const guest = await b.join(host.room.code, '친구');
  assert.equal(seatOf(guest.room, guest.playerId), null);
  assert.deepEqual(guest.room.seatRequests, []);
  const third = await c.join(host.room.code, '셋째');

  b.send({ type: 'requestSeat', seat: 3 });
  const seen = await a.room(r => r.seatRequests?.length === 1);
  const request = seen.seatRequests![0];
  assert.deepEqual({ ...request, id: undefined, requestedAt: undefined },
    { id: undefined, requestedAt: undefined, playerId: guest.playerId, nickname: '친구', seat: 3, kind: 'sit', stack: 1000 });
  assert.match(request.id, /^[a-f0-9-]{36}$/);
  assert.equal(seatOf(seen, guest.playerId), null, 'a request never seats by itself');
  const others = await c.room(r => r.seatRequests?.length === 1);
  assert.equal(others.seatRequests![0].seat, 3);
  // A third member cannot take or request the reserved seat, nor approve.
  c.send({ type: 'requestSeat', seat: 3 });
  assert.equal((await c.error()).code, 'SEAT_UNAVAILABLE');
  c.send({ type: 'resolveSeatRequest', requestId: request.id, approve: true });
  assert.equal((await c.error()).code, 'SEAT_REQUEST_INVALID');
  // Unseated members are not enough to start: only seated players are dealt in.
  a.send({ type: 'startHand', previousHandId: null });
  assert.match((await a.error()).message, /자리에 앉아/);
  assert.ok(third.playerId);
});

test('host approval assigns the seat on the server and the seated pair can play', async t => {
  const app = await setup(t);
  const a = await app.connect(), b = await app.connect();
  const host = await a.create();
  await hostSits(a, host.playerId);
  const guest = await b.join(host.room.code, '친구');
  b.send({ type: 'requestSeat', seat: 4 });
  const pending = await a.room(r => r.seatRequests?.length === 1);
  a.send({ type: 'resolveSeatRequest', requestId: pending.seatRequests![0].id, approve: true });
  const approved = await b.room(r => seatOf(r, guest.playerId) === 4);
  assert.deepEqual(approved.seatRequests, []);
  assert.equal(approved.seatNotice?.approved, true);
  assert.equal(approved.seatNotice?.seat, 4);
  // Double approval of the same request is rejected (single-use decision).
  a.send({ type: 'resolveSeatRequest', requestId: pending.seatRequests![0].id, approve: true });
  assert.equal((await a.error()).code, 'SEAT_REQUEST_INVALID');
  // Seated player cannot request a second seat (no double seating).
  b.send({ type: 'requestSeat', seat: 2 });
  assert.equal((await b.error()).code, 'SEAT_REQUEST_INVALID');
  a.send({ type: 'startHand', previousHandId: null });
  const hand = (await b.room(r => !!r.holdem)).holdem!;
  assert.deepEqual(hand.players.map(p => p.id), [host.playerId, guest.playerId], 'clockwise seat order 0 → 4');
  assert.equal(hand.players.find(p => p.id === guest.playerId)!.cards!.length, 2);
});

test('rejection releases the reservation and the notice survives a refresh (resume)', async t => {
  const app = await setup(t);
  const a = await app.connect(), b = await app.connect();
  const host = await a.create();
  await hostSits(a, host.playerId);
  const guest = await b.join(host.room.code, '친구');
  b.send({ type: 'requestSeat', seat: 1 });
  const pending = await a.room(r => r.seatRequests?.length === 1);
  a.send({ type: 'resolveSeatRequest', requestId: pending.seatRequests![0].id, approve: false });
  const rejected = await b.room(r => r.seatNotice?.approved === false);
  assert.deepEqual(rejected.seatRequests, []);
  assert.equal(seatOf(rejected, guest.playerId), null);
  assert.deepEqual({ approved: rejected.seatNotice?.approved, seat: rejected.seatNotice?.seat }, { approved: false, seat: 1 });
  b.socket.terminate();
  const again = await app.connect();
  again.send({ type: 'resume', code: host.room.code, token: guest.token });
  const resumed = await again.next('joined') as Joined;
  assert.equal(resumed.room.seatNotice?.approved, false);
  assert.equal(seatOf(resumed.room, guest.playerId), null);
  // The seat is free again; a new request clears the old notice.
  again.send({ type: 'requestSeat', seat: 1 });
  const retried = await again.room(r => r.seatRequests?.length === 1);
  assert.equal(retried.seatNotice, null);
});

test('duplicate requests, occupied seats, invalid seats and chip amounts on seat requests are refused', async t => {
  const app = await setup(t);
  const a = await app.connect(), b = await app.connect();
  const host = await a.create();
  await hostSits(a, host.playerId);
  await b.join(host.room.code, '친구');
  b.send({ type: 'requestSeat', seat: 0 });
  assert.equal((await b.error()).code, 'SEAT_UNAVAILABLE', 'seat 0 is the host');
  b.send({ type: 'requestSeat', seat: 6 });
  assert.equal((await b.error()).code, 'INVALID_REQUEST');
  // Rebuy is a separate (future) request; a seat request carrying chips is malformed, never a grant.
  b.send({ type: 'requestSeat', seat: 2, rebuyAmount: 500 });
  assert.equal((await b.error()).code, 'INVALID_REQUEST');
  b.send({ type: 'requestSeat', seat: 2, rebuyAmount: 0 });
  assert.equal((await b.error()).code, 'INVALID_REQUEST');
  b.send({ type: 'requestSeat', seat: 2 });
  await a.room(r => r.seatRequests?.length === 1);
  b.send({ type: 'requestSeat', seat: 3 });
  assert.equal((await b.error()).code, 'SEAT_REQUEST_INVALID', 'one pending request per member');
  b.send({ type: 'cancelSeatRequest' });
  await a.room(r => r.seatRequests?.length === 0);
  b.send({ type: 'cancelSeatRequest' });
  assert.equal((await b.error()).code, 'SEAT_REQUEST_INVALID');
  a.send({ type: 'requestSeat', seat: 1 });
  assert.equal((await a.error()).code, 'SEAT_REQUEST_INVALID', 'host is already seated');
});

test('simultaneous requests for one seat leave exactly one pending request', async t => {
  const app = await setup(t);
  const a = await app.connect(), b = await app.connect(), c = await app.connect();
  const host = await a.create();
  await hostSits(a, host.playerId);
  const first = await b.join(host.room.code, 'B'), second = await c.join(host.room.code, 'C');
  b.send({ type: 'requestSeat', seat: 5 }); c.send({ type: 'requestSeat', seat: 5 });
  const settled = await a.room(r => r.seatRequests?.length === 1);
  const winner = settled.seatRequests![0].playerId;
  assert.ok([first.playerId, second.playerId].includes(winner));
  const loser = winner === first.playerId ? c : b;
  assert.equal((await loser.error()).code, 'SEAT_UNAVAILABLE');
  a.send({ type: 'resolveSeatRequest', requestId: settled.seatRequests![0].id, approve: true });
  const seated = await a.room(r => seatOf(r, winner) === 5);
  assert.equal(seated.players.filter(p => p.seat === 5).length, 1);
});

test('requests persist while the host is offline and survive both sides refreshing', async t => {
  const app = await setup(t);
  const a = await app.connect(), b = await app.connect();
  const host = await a.create();
  await hostSits(a, host.playerId);
  const guest = await b.join(host.room.code, '친구');
  a.socket.terminate();
  await b.room(r => r.players.some(p => p.id === host.playerId && !p.connected));
  b.send({ type: 'requestSeat', seat: 2 });
  await b.room(r => r.seatRequests?.length === 1);
  b.socket.terminate();
  const guestAgain = await app.connect();
  guestAgain.send({ type: 'resume', code: host.room.code, token: guest.token });
  const restoredGuest = await guestAgain.next('joined') as Joined;
  assert.equal(restoredGuest.room.seatRequests?.[0]?.playerId, guest.playerId, 'pending state restored after refresh');
  const hostAgain = await app.connect();
  hostAgain.send({ type: 'resume', code: host.room.code, token: host.token });
  const restoredHost = await hostAgain.next('joined') as Joined;
  assert.equal(restoredHost.room.seatRequests?.length, 1);
  hostAgain.send({ type: 'resolveSeatRequest', requestId: restoredHost.room.seatRequests![0].id, approve: true });
  assert.equal(seatOf(await guestAgain.room(r => seatOf(r, guest.playerId) === 2), guest.playerId), 2);
});

test('leaving withdraws the pending request and frees the reserved seat', async t => {
  const app = await setup(t);
  const a = await app.connect(), b = await app.connect(), c = await app.connect();
  const host = await a.create();
  await hostSits(a, host.playerId);
  await b.join(host.room.code, 'B'); await c.join(host.room.code, 'C');
  b.send({ type: 'requestSeat', seat: 1 });
  const pending = await a.room(r => r.seatRequests?.length === 1);
  b.send({ type: 'leave' }); await b.next('left');
  await a.room(r => r.players.length === 2 && r.seatRequests?.length === 0);
  a.send({ type: 'resolveSeatRequest', requestId: pending.seatRequests![0].id, approve: true });
  assert.equal((await a.error()).code, 'SEAT_REQUEST_INVALID');
  c.send({ type: 'requestSeat', seat: 1 });
  await a.room(r => r.seatRequests?.[0]?.seat === 1);
});

test('a seat approved during a hand joins from the next hand, not the current one', async t => {
  const app = await setup(t, { nextHandMs: 40 });
  const a = await app.connect(), b = await app.connect(), c = await app.connect();
  const host = await a.create();
  await hostSits(a, host.playerId);
  const guest = await b.join(host.room.code, 'B');
  b.send({ type: 'requestSeat', seat: 1 });
  a.send({ type: 'resolveSeatRequest', requestId: (await a.room(r => r.seatRequests?.length === 1)).seatRequests![0].id, approve: true });
  await a.room(r => seatOf(r, guest.playerId) === 1);
  a.send({ type: 'startHand', previousHandId: null });
  const first = (await a.room(r => r.holdem?.number === 1)).holdem!;
  const late = await c.join(host.room.code, 'C');
  assert.equal(late.room.holdem?.players.some(p => p.id === late.playerId), false);
  c.send({ type: 'requestSeat', seat: 3 });
  a.send({ type: 'resolveSeatRequest', requestId: (await a.room(r => r.seatRequests?.length === 1)).seatRequests![0].id, approve: true });
  const during = await c.room(r => seatOf(r, late.playerId) === 3);
  assert.equal(during.holdem?.id, first.id, 'current hand untouched');
  assert.deepEqual(during.holdem?.players.map(p => p.id), first.players.map(p => p.id));
  assert.equal(during.holdem?.players.reduce((sum, p) => sum + p.stack + p.totalBet, 0), 2000, 'chips of the running hand unchanged');
  const actor = first.actorId === host.playerId ? a : b;
  actor.send({ type: 'act', handId: first.id, revision: first.revision, action: 'fold' });
  const next = (await c.room(r => r.holdem?.number === 2)).holdem!;
  assert.deepEqual(next.players.map(p => p.id), [host.playerId, guest.playerId, late.playerId]);
  assert.equal(next.players.find(p => p.id === late.playerId)!.cards!.length, 2);
  assert.equal(next.players.reduce((sum, p) => sum + p.stack + p.totalBet, 0), 3000);
});

test('checkpoint keeps nullable seats and pending requests across restart', async t => {
  const store = memoryStore();
  let app = await setup(t, { store });
  const a = await app.connect(), b = await app.connect(), c = await app.connect();
  const host = await a.create();
  await hostSits(a, host.playerId);
  const guest = await b.join(host.room.code, 'B');
  const waiter = await c.join(host.room.code, 'C');
  b.send({ type: 'requestSeat', seat: 4 });
  const request = (await a.room(r => r.seatRequests?.length === 1)).seatRequests![0];
  const saved = store.saved!.rooms[0];
  assert.equal(saved.seatLayout, 6);
  assert.deepEqual(saved.players.map(p => p.seat), [0, null, null]);
  assert.equal(saved.seatRequests?.[0].id, request.id);
  await app.close();
  app = await setup(t, { store });
  const ra = await app.connect();
  ra.send({ type: 'resume', code: host.room.code, token: host.token });
  const restored = await ra.next('joined') as Joined;
  assert.equal(seatOf(restored.room, host.playerId), 0);
  assert.equal(seatOf(restored.room, waiter.playerId), null);
  assert.deepEqual(restored.room.seatRequests?.map(r => [r.id, r.playerId, r.seat]), [[request.id, guest.playerId, 4]]);
});

test('legacy auto-seat checkpoints map onto fixed seats without changing clockwise order or dealer rotation', async t => {
  const now = Date.now();
  const player = (id: string, seat: number) => ({ id, nickname: id, token: 'a'.repeat(63) + id.slice(-1), stack: 1000, seat, expiresAt: now + 60_000 });
  const legacy: LobbyCheckpoint = { version: 1, savedAt: now, rooms: [{
    code: 'ABCDEFGH', game: 'holdem', hostId: 'p1', nextSeat: 9, dealerSeat: 5, handNumber: 3,
    players: [player('p3', 8), player('p1', 0), player('p2', 5)],
  }] };
  const store = memoryStore(legacy);
  const app = await setup(t, { store });
  const saved = store.saved!.rooms[0];
  assert.equal(saved.seatLayout, 6);
  assert.deepEqual(Object.fromEntries(saved.players.map(p => [p.id, p.seat])), { p1: 0, p2: 1, p3: 2 });
  assert.equal(saved.dealerSeat, 1, 'dealer was p2 (old seat 5) → new seat 1; next dealer is still p3');
  assert.deepEqual(saved.seatRequests, []);
  assert.ok(app);
});

test('authenticated reload restores a pending request; a second login of the same account cannot hold a second seat', async t => {
  // Tokens are "account:session"; the real authorizer is covered elsewhere.
  const app = await setup(t, { authorize: async token => {
    const [accountId, sessionId] = token.split(':');
    return accountId && sessionId ? { accountId, sessionId } : null;
  } });
  const a = await app.connect(), b = await app.connect();
  a.send({ type: 'create', nickname: 'A', game: 'holdem', accessToken: 'acct-a:s1' });
  const host = await a.next('joined') as Joined;
  await hostSits(a, host.playerId, 0, { accessToken: 'acct-a:s1' });
  b.send({ type: 'join', code: host.room.code, nickname: 'B', accessToken: 'acct-b:s1' });
  const guest = await b.next('joined') as Joined;
  b.send({ type: 'requestSeat', seat: 2, accessToken: 'acct-b:s1' });
  await a.room(r => r.seatRequests?.length === 1);
  b.socket.terminate();
  // Page refresh: same login, no saved room token.
  const reload = await app.connect();
  reload.send({ type: 'currentRoom', accessToken: 'acct-b:s1' });
  const restored = await reload.next('joined') as Joined;
  assert.equal(restored.playerId, guest.playerId);
  assert.deepEqual(restored.room.seatRequests?.map(r => [r.playerId, r.seat]), [[guest.playerId, 2]]);
  // The same account cannot join again as a second member (and so cannot take a second seat).
  const twin = await app.connect();
  twin.send({ type: 'join', code: host.room.code, nickname: 'B2', accessToken: 'acct-b:s1' });
  assert.equal((await twin.error()).code, 'ALREADY_JOINED');
  // A new login of that account coming back to the same room (another device) takes the membership
  // over: same member, same pending request, chips kept; the old login is closed with 4003. Still one member.
  const oldClosed = once(reload.socket, 'close');
  const newLogin = await app.connect();
  newLogin.send({ type: 'join', code: host.room.code, nickname: 'B', accessToken: 'acct-b:s2' });
  const replaced = await newLogin.next('joined') as Joined;
  assert.equal(replaced.playerId, guest.playerId);
  assert.equal((await oldClosed)[0], 4003);
  assert.equal(replaced.room.players.find(p => p.id === replaced.playerId)?.stack, 1000);
  assert.deepEqual(replaced.room.seatRequests?.map(r => [r.playerId, r.seat]), [[guest.playerId, 2]]);
  assert.equal(replaced.room.players.filter(p => p.nickname === 'B').length, 1);
  assert.equal(seatOf(replaced.room, replaced.playerId), null);
});

test('seat decisions are independent of chips: no path in seating changes a balance', () => {
  const room: SeatRoom = { hostId: 'h', nextSeat: 0, seatRequests: [], players: [
    { id: 'h', nickname: 'H', stack: 1000, seat: null }, { id: 'g', nickname: 'G', stack: 0, seat: null }, { id: 'x', nickname: 'X', stack: 37, seat: null }] };
  const stacks = () => room.players.map(p => p.stack);
  const before = stacks();
  assert.deepEqual(requestSeat(room, room.players[0], 2), { ok: true }); // host: immediate
  assert.equal(room.players[0].seat, 2);
  assert.deepEqual(requestSeat(room, room.players[1], 0), { ok: true }); // zero balance may still ask for a seat
  assert.deepEqual(requestSeat(room, room.players[2], 1), { ok: true });
  assert.equal(cancelSeatRequest(room, room.players[2]).ok, true);
  const [request] = room.seatRequests;
  assert.equal(resolveSeatRequest(room, room.players[1], request.id, true).ok, false, 'non-host cannot decide');
  assert.equal(resolveSeatRequest(room, room.players[0], request.id, true).ok, true);
  assert.equal(resolveSeatRequest(room, room.players[0], request.id, true).ok, false, 'single-use');
  assert.equal(room.players[1].seat, 0);
  assert.deepEqual(stacks(), before);
  assert.deepEqual(Object.keys(request).sort(), ['id', 'kind', 'playerId', 'requestedAt', 'seat', 'stack'], 'no chip-grant field on seat requests');
});
