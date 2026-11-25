import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { WebSocket } from 'ws';
import type { LobbyRoom, ServerMessage } from '@boardgame/shared';
import { createAppServer } from '../src/http.ts';
import { attachLobby, type LobbyCheckpoint } from '../src/lobby.ts';
import { releaseSeat, requestSeat, standUp, type SeatRoom } from '../src/seating.ts';

// FT-FEAT-003 (3-minute seat hold on disconnect) and FT-FEAT-004 (chip balance kept after the seat
// is released). Production path: no autoSeat, authenticated accounts ("account:session" tokens).
type Joined = Extract<ServerMessage, { type: 'joined' }>;
type RoomMessage = Extract<ServerMessage, { type: 'room' }>;
type ErrorMessage = Extract<ServerMessage, { type: 'error' }>;

class Peer {
  socket: WebSocket;
  queue: ServerMessage[] = [];
  token = '';
  private waiting: (() => void) | undefined;
  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on('message', data => { this.queue.push(JSON.parse(data.toString())); this.waiting?.(); });
  }
  /** Drop already received messages so the next wait only sees what follows. */
  clear() { this.queue.length = 0; }
  send(value: Record<string, unknown>) { this.socket.send(JSON.stringify({ ...value, accessToken: this.token })); }
  next(type: ServerMessage['type'], predicate: (value: ServerMessage) => boolean = () => true, ms = 2000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.waiting = undefined; reject(new Error(`Timed out waiting for ${type}: ${predicate.toString()}`)); }, ms);
      const check = () => {
        const index = this.queue.findIndex(item => item.type === type && predicate(item));
        if (index !== -1) { clearTimeout(timeout); this.waiting = undefined; resolve(this.queue.splice(index, 1)[0]); }
      };
      this.waiting = check;
      check();
    });
  }
  async room(predicate: (room: LobbyRoom) => boolean, ms?: number) {
    return (await this.next('room', m => m.type === 'room' && predicate(m.room), ms) as RoomMessage).room;
  }
  async error() { return await this.next('error') as ErrorMessage; }
}

function memoryStore(initial: LobbyCheckpoint | null = null) {
  return { saved: initial, load() { return this.saved; }, save(value: LobbyCheckpoint) { this.saved = structuredClone(value); } };
}
const authorize = async (token: string) => {
  const [accountId, sessionId] = token.split(':');
  return accountId && sessionId ? { accountId, sessionId } : null;
};

async function setup(t: TestContext, options: Parameters<typeof attachLobby>[1] = {}) {
  const server = createAppServer();
  const lobby = attachLobby(server, { authorize, runoutMs: 5, riverSqueezeMs: 10, nextHandMs: 60_000, turnMs: 10_000, seatRetentionMs: 10_000, ...options });
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
    async connect(token: string) { const peer = new Peer(url); peer.token = token; peers.push(peer); await once(peer.socket, 'open'); return peer; },
  };
}
const player = (room: LobbyRoom, id: string) => (room.players.find(p => p.id === id) ?? {} as LobbyRoom["players"][number]);
const seatOf = (room: LobbyRoom, id: string) => player(room, id)?.seat;

/** Host creates and sits at 0; each guest joins and is approved into the given seat. */
async function table(app: Awaited<ReturnType<typeof setup>>, guests: Array<[token: string, nickname: string, seat: number]> = [['b:s1', 'B', 1]]) {
  const host = await app.connect('a:s1');
  host.send({ type: 'create', nickname: 'A', game: 'holdem' });
  const created = await host.next('joined') as Joined;
  host.send({ type: 'requestSeat', seat: 0 });
  await host.room(r => seatOf(r, created.playerId) === 0);
  const seated: Array<{ peer: Peer; id: string }> = [];
  for (const [token, nickname, seat] of guests) {
    const peer = await app.connect(token);
    peer.send({ type: 'join', code: created.room.code, nickname });
    const joined = await peer.next('joined') as Joined;
    peer.send({ type: 'requestSeat', seat });
    const pending = await host.room(r => r.seatRequests?.some(q => q.playerId === joined.playerId) ?? false);
    host.send({ type: 'resolveSeatRequest', requestId: pending.seatRequests!.find(q => q.playerId === joined.playerId)!.id, approve: true });
    await peer.room(r => seatOf(r, joined.playerId) === seat);
    seated.push({ peer, id: joined.playerId });
  }
  return { host, hostId: created.playerId, code: created.room.code, guests: seated };
}
async function reconnect(app: Awaited<ReturnType<typeof setup>>, token: string) {
  const peer = await app.connect(token);
  peer.send({ type: 'currentRoom' });
  return { peer, joined: await peer.next('joined') as Joined };
}
const total = (room: LobbyRoom) => room.players.reduce((sum, p) => sum + (p.stack ?? 0), 0) + (room.holdem && room.holdem.street !== 'complete' ? room.holdem.pot : 0);

test('within the hold the same account gets its seat and chips back without host approval; default hold is 3 minutes', async t => {
  const app = await setup(t, { seatRetentionMs: 300_000 });
  const { host, code, guests: [b] } = await table(app);
  const before = Date.now();
  host.clear();
  b.peer.socket.terminate();
  const away = await host.room(r => player(r, b.id).connected === false);
  assert.equal(seatOf(away, b.id), 1, 'seat is kept while disconnected');
  const until = player(away, b.id).seatHeldUntil!;
  assert.ok(until >= before + 180_000 && until <= Date.now() + 180_000, 'server-clock hold of 3 minutes');
  assert.equal(player(away, b.id).standingUp, false);
  // Nobody else can take the held seat.
  const c = await app.connect('c:s1');
  c.send({ type: 'join', code, nickname: 'C' });
  await c.next('joined');
  c.send({ type: 'requestSeat', seat: 1 });
  assert.equal((await c.error()).code, 'SEAT_UNAVAILABLE');
  const { joined } = await reconnect(app, 'b:s1');
  assert.equal(joined.playerId, b.id);
  assert.equal(seatOf(joined.room, b.id), 1, 'seat restored');
  assert.equal(player(joined.room, b.id).stack, 1000, 'chips restored');
  assert.equal(player(joined.room, b.id).seatHeldUntil, null);
  assert.deepEqual(joined.room.seatRequests, [], 'no approval was needed');
  void code;
});

test('after the hold expires (no hand) the seat is released, the member stays as a spectator with the same chips and must be approved to sit again', async t => {
  const app = await setup(t, { seatHoldMs: 80 });
  const { host, hostId, guests: [b] } = await table(app);
  // Change B's balance first so "kept chips" is meaningful: one heads-up hand where A folds.
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  assert.equal(hand.actorId, hostId, 'dealer/SB acts first heads-up');
  host.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'fold' });
  const settled = await host.room(r => r.holdem?.street === 'complete');
  const bStack = player(settled, b.id).stack!;
  assert.equal(bStack, 1010);
  host.clear();
  b.peer.socket.terminate();
  const released = await host.room(r => player(r, b.id) && seatOf(r, b.id) === null, 3000);
  assert.equal(player(released, b.id).stack, bStack, 'balance kept with the member');
  assert.equal(released.players.length, 2, 'still a member of the room');
  assert.equal(released.holdem?.id, hand.id, 'no new hand: only one seated player');
  const { peer, joined } = await reconnect(app, 'b:s1');
  assert.equal(seatOf(joined.room, b.id), null, 'no automatic re-seat after the hold');
  assert.equal(player(joined.room, b.id).stack, bStack);
  peer.send({ type: 'requestSeat', seat: 1 });
  const pending = await host.room(r => r.seatRequests?.length === 1);
  assert.equal(pending.seatRequests![0].kind, 'resit');
  assert.equal(pending.seatRequests![0].stack, bStack);
  assert.equal(seatOf(pending, b.id), null, 'the request alone does not seat');
  host.send({ type: 'resolveSeatRequest', requestId: pending.seatRequests![0].id, approve: true });
  const back = await peer.room(r => seatOf(r, b.id) === 1);
  assert.equal(player(back, b.id).stack, bStack, 'approval never grants chips');
});

test('hold expiring mid-hand keeps the seat until the hand ends, then releases it with the settled balance', async t => {
  const app = await setup(t, { seatHoldMs: 80 });
  const { host, hostId, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  host.clear();
  b.peer.socket.terminate();
  const pending = await host.room(r => player(r, b.id).standingUp === true, 3000);
  assert.equal(seatOf(pending, b.id), 1, 'seat kept while the hand is running');
  assert.equal(pending.holdem?.id, hand.id);
  assert.equal(pending.holdem?.street, 'preflop', 'hand not cut short');
  assert.equal(total(pending), 2000);
  host.send({ type: 'act', handId: hand.id, revision: pending.holdem!.revision, action: 'fold' });
  const done = await host.room(r => r.holdem?.street === 'complete' && seatOf(r, b.id) === null);
  assert.equal(player(done, b.id).stack, done.holdem!.players.find(p => p.id === b.id)!.stack);
  assert.equal(player(done, b.id).stack, 1010);
  assert.equal(player(done, hostId).stack, 990);
  assert.equal(total(done), 2000, 'chips conserved');
  assert.equal(player(done, b.id).standingUp, false);
  // Reconnecting after the hold: spectator with the settled balance.
  const { joined } = await reconnect(app, 'b:s1');
  assert.equal(seatOf(joined.room, b.id), null);
  assert.equal(player(joined.room, b.id).stack, 1010);
});

test('reconnecting after the hold expired mid-hand does not cancel the release', async t => {
  const app = await setup(t, { seatHoldMs: 80 });
  const { host, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  host.clear();
  b.peer.socket.terminate();
  await host.room(r => player(r, b.id).standingUp === true, 3000);
  const { joined } = await reconnect(app, 'b:s1');
  assert.equal(seatOf(joined.room, b.id), 1, 'still in the running hand');
  assert.equal(player(joined.room, b.id).standingUp, true);
  host.send({ type: 'act', handId: hand.id, revision: joined.room.holdem!.revision, action: 'fold' });
  const done = await host.room(r => r.holdem?.street === 'complete');
  assert.equal(seatOf(done, b.id), null);
});

test('voluntary stand-up: immediate when not in a hand, otherwise after the hand; next hand deals only seated players', async t => {
  const app = await setup(t, { nextHandMs: 30 });
  const { host, hostId, guests: [b, c] } = await table(app, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  assert.deepEqual(hand.players.map(p => p.id), [hostId, b.id, c.id]);
  c.peer.send({ type: 'standUp', stack: 999_999 });
  const marked = await host.room(r => player(r, c.id).standingUp === true);
  assert.equal(seatOf(marked, c.id), 2, 'seat kept during the hand');
  assert.equal(marked.holdem?.revision, hand.revision, 'standing up does not act in the hand');
  c.peer.send({ type: 'standUp' });
  assert.equal((await c.peer.error()).code, 'SEAT_REQUEST_INVALID', 'no double stand-up');
  // A (dealer/UTG) and B (SB) fold: C (BB, standing up) wins the blinds and is still paid.
  assert.equal(marked.holdem!.actorId, hostId);
  host.send({ type: 'act', handId: hand.id, revision: marked.holdem!.revision, action: 'fold' });
  const afterA = await b.peer.room(r => r.holdem?.actorId === b.id);
  b.peer.send({ type: 'act', handId: hand.id, revision: afterA.holdem!.revision, action: 'fold' });
  const done = await host.room(r => r.holdem?.id === hand.id && r.holdem.street === 'complete' && seatOf(r, c.id) === null);
  assert.equal(player(done, c.id).stack, 1010, 'balance settled, client-supplied stack ignored');
  assert.equal(total(done), 3000);
  const next = await host.room(r => !!r.holdem && r.holdem.id !== hand.id, 3000);
  assert.deepEqual(next.holdem!.players.map(p => p.id).sort(), [hostId, b.id].sort(), 'spectator not dealt');
  // Re-sitting needs approval again; approved mid-hand it starts from the next hand.
  c.peer.clear(); host.clear();
  c.peer.send({ type: 'requestSeat', seat: 2 });
  const req = await host.room(r => r.seatRequests?.length === 1);
  assert.equal(req.seatRequests![0].kind, 'resit');
  host.send({ type: 'resolveSeatRequest', requestId: req.seatRequests![0].id, approve: true });
  const reseated = await c.peer.room(r => seatOf(r, c.id) === 2);
  assert.ok(!reseated.holdem!.players.some(p => p.id === c.id), 'approved mid-hand → joins from the next hand');
  assert.equal(player(reseated, c.id).stack, 1010);
});

test('standing up outside a hand releases at once; the host re-sits directly, others need approval', async t => {
  const app = await setup(t);
  const { host, hostId, guests: [b] } = await table(app);
  b.peer.send({ type: 'standUp' });
  const up = await host.room(r => seatOf(r, b.id) === null);
  assert.equal(player(up, b.id).stack, 1000);
  assert.equal(up.players.length, 2);
  host.send({ type: 'standUp' });
  await host.room(r => seatOf(r, hostId) === null);
  host.send({ type: 'requestSeat', seat: 3 });
  const hostBack = await host.room(r => seatOf(r, hostId) === 3);
  assert.deepEqual(hostBack.seatRequests, []);
  b.peer.send({ type: 'standUp' });
  assert.equal((await b.peer.error()).code, 'SEAT_REQUEST_INVALID', 'nothing to stand up from');
});

test('balance survives leaving the room and is restored once for the same account only', async t => {
  const store = memoryStore();
  const app = await setup(t, { store });
  const { host, hostId, code, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  host.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'fold' });
  await host.room(r => r.holdem?.street === 'complete');
  host.clear();
  b.peer.send({ type: 'leave' });
  await b.peer.next('left');
  const gone = await host.room(r => r.players.length === 1);
  assert.equal(player(gone, hostId).stack, 990);
  assert.equal(store.saved!.rooms[0].chipLedger!.b.stack, 1010, 'server-side ledger');
  // A different account gets fresh chips, never B's balance.
  const c = await app.connect('c:s1');
  c.send({ type: 'join', code, nickname: 'C', stack: 50_000 });
  const cj = await c.next('joined') as Joined;
  assert.equal(player(cj.room, cj.playerId).stack, 1000);
  // B returns: balance and id restored once, unseated (re-seat needs approval).
  const back = await app.connect('b:s1');
  back.send({ type: 'join', code, nickname: 'B' });
  const bj = await back.next('joined') as Joined;
  assert.equal(bj.playerId, b.id);
  assert.equal(player(bj.room, b.id).stack, 1010);
  assert.equal(seatOf(bj.room, b.id), null);
  assert.equal(store.saved!.rooms[0].chipLedger!.b, undefined, 'entry consumed: no second restore');
  assert.equal(total(bj.room), 3000, "990 (A) + 1010 (B, restored) + 1000 (C, new)");
  // Leaving and rejoining again restores the current balance, not the old one twice.
  back.send({ type: 'leave' });
  await back.next('left');
  const again = await app.connect('b:s1');
  again.send({ type: 'join', code, nickname: 'B' });
  const aj = await again.next('joined') as Joined;
  assert.equal(player(aj.room, b.id).stack, 1010);
});

test('a chip reset or settings change invalidates kept balances of absent accounts', async t => {
  const app = await setup(t);
  const { host, hostId, code, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  host.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'fold' });
  await host.room(r => r.holdem?.street === 'complete');
  host.clear();
  b.peer.send({ type: 'leave' });
  await host.room(r => r.players.length === 1);
  host.send({ type: 'resetChips', handId: hand.id });
  const reset = await host.room(r => !r.holdem);
  assert.equal(player(reset, hostId).stack, 1000);
  const back = await app.connect('b:s1');
  back.send({ type: 'join', code, nickname: 'B' });
  const bj = await back.next('joined') as Joined;
  assert.equal(player(bj.room, bj.playerId).stack, 1000, 'reset applies to the absent account too');
});

test('another account cannot reclaim a held seat by token or by currentRoom', async t => {
  const app = await setup(t);
  const { host, code, guests: [b] } = await table(app);
  host.clear();
  b.peer.socket.terminate();
  await host.room(r => player(r, b.id).connected === false);
  const stranger = await app.connect('x:s1');
  stranger.send({ type: 'currentRoom' });
  await stranger.next('noRoom');
  const after = await reconnect(app, 'b:s1');
  const roomToken = after.joined.token;
  host.clear();
  after.peer.socket.terminate();
  await host.room(r => player(r, b.id).connected === false);
  const thief = await app.connect('x:s1');
  thief.send({ type: 'resume', code, token: roomToken });
  assert.equal((await thief.error()).code, 'SESSION_EXPIRED');
  const owner = await reconnect(app, 'b:s1');
  assert.equal(seatOf(owner.joined.room, b.id), 1, 'seat still held for the owner');
});

test('server restart keeps held seats (not renewed), stand-up state and kept balances', async t => {
  const store = memoryStore();
  const first = await setup(t, { store });
  const { host, code, guests: [b, c] } = await table(first, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  host.clear();
  c.peer.send({ type: 'leave' });
  await host.room(r => r.players.length === 2);
  await first.close();
  const saved = store.saved!;
  assert.equal(saved.rooms[0].chipLedger!.c.stack, 1000);
  // Restart within the hold: B reclaims its seat without approval.
  const second = await setup(t, { store: memoryStore(structuredClone(saved)) });
  const bBack = await reconnect(second, 'b:s1');
  assert.equal(seatOf(bBack.joined.room, b.id), 1);
  const held = bBack.joined.room.players.find(p => p.seat === 0)!;
  assert.ok(held.seatHeldUntil! <= saved.savedAt + 180_000, 'hold counted from the last save, not renewed');
  const cBack = await second.connect('c:s1');
  cBack.send({ type: 'join', code, nickname: 'C' });
  const cj = await cBack.next('joined') as Joined;
  assert.equal(cj.playerId, c.id, 'kept balance survived the restart');
  await second.close();
  // Restart long after the hold: seats are released, chips kept, members still in the room.
  const old = structuredClone(saved);
  old.savedAt = Date.now() - 200_000;
  // Membership grace (5 min) still running, seat hold (3 min) over.
  const third = await setup(t, { store: memoryStore(old), seatRetentionMs: 300_000 });
  const late = await reconnect(third, 'b:s1');
  assert.equal(seatOf(late.joined.room, b.id), null);
  assert.equal(player(late.joined.room, b.id).stack, 1000);
  assert.equal(late.joined.room.players.length, 2);
  void host;
});

test('a pending stand-up survives a restart mid-hand and still waits for that hand to end', async t => {
  const store = memoryStore();
  const first = await setup(t, { store });
  const { host, hostId, guests: [b, c] } = await table(first, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  c.peer.send({ type: 'standUp' });
  await host.room(r => player(r, c.id).standingUp === true);
  await first.close();
  const second = await setup(t, { store: memoryStore(structuredClone(store.saved!)) });
  const a2 = await reconnect(second, 'a:s1'), b2 = await reconnect(second, 'b:s1');
  assert.equal(a2.joined.room.holdem?.id, hand.id, 'same hand restored');
  assert.equal(seatOf(a2.joined.room, c.id), 2);
  assert.equal(player(a2.joined.room, c.id).standingUp, true);
  assert.equal(seatOf(a2.joined.room, b.id), 1, 'B reclaimed its seat inside the hold');
  a2.peer.send({ type: 'act', handId: hand.id, revision: a2.joined.room.holdem!.revision, action: 'fold' });
  const turn = await b2.peer.room(r => r.holdem?.actorId === b.id);
  b2.peer.send({ type: 'act', handId: hand.id, revision: turn.holdem!.revision, action: 'fold' });
  const done = await a2.peer.room(r => r.holdem?.street === 'complete');
  assert.equal(seatOf(done, c.id), null);
  assert.equal(player(done, c.id).stack, 1010);
  assert.equal(total(done), 3000);
  void hostId;
});

test('seat module: stand-up and release never change a balance', () => {
  const room: SeatRoom = { hostId: 'h', nextSeat: 0, seatRequests: [], players: [{ id: 'h', nickname: 'H', stack: 1234, seat: null }] };
  const [h] = room.players;
  assert.deepEqual(requestSeat(room, h, 1), { ok: true });
  assert.deepEqual(standUp(h, true), { ok: true });
  assert.equal(h.seat, 1); assert.equal(h.standPending, 'voluntary');
  assert.equal(standUp(h, true).ok, false);
  releaseSeat(h);
  assert.equal(h.seat, null); assert.equal(h.standPending, undefined); assert.equal(h.seatedBefore, true);
  assert.equal(standUp(h, false).ok, false);
  assert.equal(h.stack, 1234);
});
