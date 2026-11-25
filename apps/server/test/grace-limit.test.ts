import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import type { LobbyRoom } from '@boardgame/shared';
import { memoryStore, player, reconnect, rebuy, seatOf, setup, sleep, stubAuth, table, total, type Joined, type Peer } from './support/seat-harness.ts';

// 2026-11-24 23:25 KST policies: 2-second disconnect grace, room rebuy limit (settings.maxRebuy),
// host's own rebuy without approval.

const settings = (room: LobbyRoom, extra: Record<string, unknown> = {}) => ({ ...room.settings, ...extra });
async function updateSettings(host: Peer, room: LobbyRoom, extra: Record<string, unknown>) {
  host.send({ type: 'updateSettings', settings: settings(room, extra), expectedRevision: room.settingsRevision, requestId: 'edit-' + Date.now() });
  return await host.next('settingsUpdated');
}
/** Fresh room snapshot for `peer` (ping round trip, then the latest snapshot or the given fallback). */
async function current(peer: Peer, fallback: LobbyRoom) { peer.send({ type: 'ping', id: 1 }); await peer.next('pong'); return peer.latest() ?? fallback; }

// ---------- 1. 2-second grace ----------

test('reconnecting within the grace cancels the scheduled check/fold; seat, chips and hand stay as they were', async t => {
  const app = await setup(t, { offlineGraceMs: 400 });
  const { host, hostId, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await b.peer.room(r => !!r.holdem)).holdem!;
  assert.equal(hand.actorId, hostId);
  host.socket.terminate();
  await b.peer.room(r => player(r, hostId).connected === false);
  await sleep(150);
  const back = await reconnect(app, 'a:s1');
  await sleep(500); // past the original 400 ms grace
  const now = await current(back.peer, back.joined.room);
  assert.equal(now.holdem!.revision, hand.revision, 'no automatic action');
  assert.equal(now.holdem!.actorId, hostId);
  assert.equal(seatOf(now, hostId), 0);
  assert.deepEqual(now.holdem!.players.find(p => p.id === hostId)!.cards, back.joined.room.holdem!.players.find(p => p.id === hostId)!.cards);
  back.peer.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'call' });
  const moved = await b.peer.room(r => r.holdem?.actorId === b.id);
  assert.equal(moved.holdem!.players.find(p => p.id === hostId)!.folded, false, 'own action accepted');
});

test('default grace is 2 s: no action before it, then fold when a bet is faced', async t => {
  const app = await setup(t, { offlineGraceMs: undefined });
  const { host, hostId, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await b.peer.room(r => !!r.holdem)).holdem!;
  b.peer.clear();
  const start = Date.now();
  host.socket.terminate();
  await b.peer.room(r => player(r, hostId).connected === false);
  const folded = await b.peer.room(r => r.holdem?.id === hand.id && r.holdem.street === 'complete', 4000);
  const took = Date.now() - start;
  assert.ok(took >= 1950, `not before 2 s (took ${took} ms)`);
  assert.ok(took < 3000, `soon after 2 s (took ${took} ms)`);
  assert.equal(folded.holdem!.players.find(p => p.id === hostId)!.folded, true);
  assert.equal(total(folded), 2000);
});

test('after the grace a disconnected player who may check is checked, not folded', async t => {
  const app = await setup(t, { offlineGraceMs: 300 });
  const { host, hostId, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  host.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'call' });
  await host.room(r => r.holdem?.actorId === b.id);
  const start = Date.now();
  b.peer.socket.terminate(); // B (BB) may check
  const flop = await host.room(r => r.holdem?.street === 'flop', 3000);
  assert.ok(Date.now() - start >= 280, 'waited for the grace');
  assert.equal(flop.holdem!.players.find(p => p.id === b.id)!.folded, false);
  void hostId;
});

test('a turn reaching a recently disconnected player waits only for the rest of the grace; a long-gone player is played at once', async t => {
  const app = await setup(t, { offlineGraceMs: 500 });
  const { host, hostId, guests: [b, c] } = await table(app, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  const off = Date.now();
  c.peer.socket.terminate(); // C = BB, not on turn yet
  await host.room(r => player(r, c.id).connected === false);
  host.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'call' });
  const bTurn = await b.peer.room(r => r.holdem?.actorId === b.id);
  b.peer.send({ type: 'act', handId: hand.id, revision: bTurn.holdem!.revision, action: 'call' });
  const cTurn = await host.room(r => r.holdem?.actorId === c.id);
  assert.ok(cTurn.holdem!.street === 'preflop');
  const flop = await host.room(r => r.holdem?.street === 'flop', 3000);
  assert.ok(Date.now() - off >= 480, 'checked only after C had been gone 500 ms');
  assert.equal(flop.holdem!.players.find(p => p.id === c.id)!.folded, false, 'C could check');
  // Flop: B, then A bet; C long gone → folded without a new wait.
  b.peer.send({ type: 'act', handId: hand.id, revision: flop.holdem!.revision, action: 'raise', amount: 40 });
  const aTurn = await host.room(r => r.holdem?.actorId === hostId && r.holdem.street === 'flop');
  host.send({ type: 'act', handId: hand.id, revision: aTurn.holdem!.revision, action: 'call' });
  const t0 = Date.now();
  const turn = await host.room(r => r.holdem?.street === 'turn');
  assert.ok(Date.now() - t0 < 300, 'no second grace');
  assert.equal(turn.holdem!.players.find(p => p.id === c.id)!.folded, true);
  assert.equal(total(turn), 3000);
});

test('another device of the same account returning within the grace cancels the automatic action', async t => {
  const app = await setup(t, { offlineGraceMs: 500 });
  const { host, hostId, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await b.peer.room(r => !!r.holdem)).holdem!;
  host.socket.terminate();
  await b.peer.room(r => player(r, hostId).connected === false);
  const laptop = await reconnect(app, 'a:laptop');
  assert.equal(laptop.joined.playerId, hostId);
  await sleep(650);
  const now = await current(laptop.peer, laptop.joined.room);
  assert.equal(now.holdem!.revision, hand.revision);
  laptop.peer.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'call' });
  await b.peer.room(r => r.holdem?.actorId === b.id);
});

test('close and reconnect racing: the reconnect wins in either order, duplicate closes do nothing, and an executed fold is not undone', async t => {
  const app = await setup(t, { offlineGraceMs: 300, authorize: stubAuth() });
  const { host, hostId, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await b.peer.room(r => !!r.holdem)).holdem!;
  // (a) new socket first, then the old one closes: the old close no longer owns the membership.
  const fresh = await reconnect(app, 'a:s1');
  host.socket.terminate();
  await sleep(450);
  let now = await current(fresh.peer, fresh.joined.room);
  assert.equal(now.holdem!.revision, hand.revision, 'replaced socket closing is not a disconnect');
  assert.equal(player(now, hostId).connected, true);
  // (b) close and reconnect in the same instant.
  const closing = once(fresh.peer.socket, 'close');
  fresh.peer.socket.terminate();
  const again = await reconnect(app, 'a:s1');
  await closing;
  fresh.peer.socket.terminate(); // duplicate close on an already closed socket
  await sleep(450);
  now = await current(again.peer, again.joined.room);
  assert.equal(now.holdem!.revision, hand.revision, 'reconnect inside the grace');
  // (c) gone past the grace: folded; coming back does not undo it.
  again.peer.socket.terminate();
  const folded = await b.peer.room(r => r.holdem?.street === 'complete', 3000);
  assert.equal(folded.holdem!.players.find(p => p.id === hostId)!.folded, true);
  const late = await reconnect(app, 'a:s1');
  assert.equal(late.joined.room.holdem!.players.find(p => p.id === hostId)!.folded, true, 'not reverted');
  assert.equal(seatOf(late.joined.room, hostId), 0, 'seat still held (3-minute policy)');
  assert.equal(total(late.joined.room), 2000);
});

test('restart during the grace: no timer carried over, nothing auto-played in the recovery window, unreturned players played after it', async t => {
  const store = memoryStore();
  const first = await setup(t, { store, offlineGraceMs: 2000 });
  const { host, hostId } = await table(first);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  host.socket.terminate();
  await sleep(50);
  await first.close();
  const second = await setup(t, { store: memoryStore(structuredClone(store.saved!)), offlineGraceMs: 2000, recoveryMs: 400 });
  const watcher = await reconnect(second, 'b:s1'); // B back, A not
  await sleep(150);
  let now = await current(watcher.peer, watcher.joined.room);
  assert.equal(now.holdem!.revision, hand.revision, 'recovery window: no action');
  const done = await watcher.peer.room(r => r.holdem?.street === 'complete', 3000);
  assert.equal(done.holdem!.players.find(p => p.id === hostId)!.folded, true, 'A did not return: folded after recovery');
  assert.equal(total(done), 2000);
  now = done;
  void now;
});

test('restart: a player who returns inside the recovery window plays normally', async t => {
  const store = memoryStore();
  const first = await setup(t, { store });
  const { host, hostId } = await table(first);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  await first.close();
  const second = await setup(t, { store: memoryStore(structuredClone(store.saved!)), recoveryMs: 300 });
  const a = await reconnect(second, 'a:s1');
  const b = await reconnect(second, 'b:s1');
  await sleep(500);
  const now = await current(a.peer, a.joined.room);
  assert.equal(now.holdem!.revision, hand.revision);
  a.peer.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'call' });
  await b.peer.room(r => r.holdem?.actorId !== hostId);
});

// ---------- 2. Room rebuy limit ----------

test('default limit is the starting chips; a request above the limit is refused by the server', async t => {
  const app = await setup(t);
  const { host, guests: [b] } = await table(app);
  b.peer.send({ type: 'requestRebuy', amount: 1001 });
  const refused = await b.peer.error();
  assert.equal(refused.code, 'REBUY_REQUEST_INVALID');
  assert.match(refused.message, /1,000칩/);
  const { room } = await rebuy(host, b.peer, b.id, 1000);
  assert.equal(player(room, b.id).stack, 2000);
});

test('host sets the limit in room settings: validated, saved, kept across restart; a limit-only change keeps everyone’s chips', async t => {
  const store = memoryStore();
  const first = await setup(t, { store });
  const { host, guests: [b] } = await table(first);
  await rebuy(host, b.peer, b.id, 300);
  const before = host.latest()!;
  for (const bad of [0, -1, 1.5, 1_000_000_001, '500']) {
    host.send({ type: 'updateSettings', settings: settings(before, { maxRebuy: bad }), expectedRevision: before.settingsRevision });
    assert.equal((await host.error()).code, 'INVALID_REQUEST', String(bad));
  }
  const ack = await updateSettings(host, before, { maxRebuy: 5000 });
  assert.equal((ack as { settings: { maxRebuy?: number } }).settings.maxRebuy, 5000);
  const after = await b.peer.room(r => r.settings?.maxRebuy === 5000);
  assert.equal(player(after, b.id).stack, 1300, 'limit-only change keeps chips');
  const { room } = await rebuy(host, b.peer, b.id, 4000);
  assert.equal(player(room, b.id).stack, 5300);
  b.peer.send({ type: 'requestRebuy', amount: 5001 });
  assert.equal((await b.peer.error()).code, 'REBUY_REQUEST_INVALID');
  await first.close();
  const second = await setup(t, { store: memoryStore(structuredClone(store.saved!)) });
  const back = await reconnect(second, 'b:s1');
  assert.equal(back.joined.room.settings?.maxRebuy, 5000, 'restored after restart');
  assert.equal(player(back.joined.room, b.id).stack, 5300);
});

test('starting chips / blinds still reset stacks as before, and a client without maxRebuy keeps the room limit', async t => {
  const app = await setup(t);
  const { host, hostId, guests: [b] } = await table(app);
  await rebuy(host, b.peer, b.id, 500);
  let room = await host.room(r => player(r, b.id).stack === 1500);
  await updateSettings(host, room, { maxRebuy: 700 });
  room = await host.room(r => r.settings?.maxRebuy === 700);
  assert.equal(player(room, b.id).stack, 1500, 'limit-only change keeps chips');
  // Older client: no maxRebuy field, new blinds.
  const legacy = { startingChips: 2000, smallBlind: 20, bigBlind: 40, turnSeconds: 30 };
  host.send({ type: 'updateSettings', settings: legacy, expectedRevision: room.settingsRevision, requestId: 'legacy' });
  await host.next('settingsUpdated');
  const reset = await b.peer.room(r => r.settings?.startingChips === 2000);
  assert.equal(reset.settings?.maxRebuy, 700, 'limit kept');
  assert.equal(player(reset, b.id).stack, 2000, 'stacks reset like before');
  assert.equal(player(reset, hostId).stack, 2000);
  assert.equal(reset.settings?.smallBlind, 20); assert.equal(reset.settings?.bigBlind, 40);
});

test('lowering the limit drops waiting requests above it (with a reason); requests within it stay', async t => {
  const app = await setup(t);
  const { host, guests: [b, c] } = await table(app, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  b.peer.send({ type: 'requestRebuy', amount: 800 });
  c.peer.send({ type: 'requestRebuy', amount: 300 });
  const pending = await host.room(r => r.rebuyRequests?.length === 2);
  await updateSettings(host, pending, { maxRebuy: 500 });
  const after = await b.peer.room(r => r.settings?.maxRebuy === 500);
  assert.deepEqual(after.rebuyRequests!.map(r => r.amount), [300]);
  assert.deepEqual({ approved: after.rebuyNotice?.approved, reason: after.rebuyNotice?.reason, limit: after.rebuyNotice?.limit }, { approved: false, reason: 'limit', limit: 500 });
  assert.equal(player(after, b.id).stack, 1000);
  host.send({ type: 'resolveRebuyRequest', requestId: after.rebuyRequests![0].id, approve: true });
  const granted = await c.peer.room(r => r.rebuyNotice?.approved === true);
  assert.equal(player(granted, c.id).stack, 1300);
  // Raising the limit later does not bring the dropped request back.
  await updateSettings(host, granted, { maxRebuy: 900 });
  const raised = await b.peer.room(r => r.settings?.maxRebuy === 900);
  assert.deepEqual(raised.rebuyRequests, []);
});

test('a limit-only change keeps balances of players who left (kept balance still restorable)', async t => {
  const app = await setup(t);
  const { host, code, guests: [b] } = await table(app);
  await rebuy(host, b.peer, b.id, 200);
  b.peer.send({ type: 'leave' });
  const gone = await host.room(r => r.players.length === 1);
  await updateSettings(host, gone, { maxRebuy: 3000 });
  await host.room(r => r.settings?.maxRebuy === 3000);
  const back = await app.connect('b:s1');
  back.send({ type: 'join', code, nickname: 'B' });
  const joined = await back.next('joined') as Joined;
  assert.equal(player(joined.room, b.id).stack, 1200);
});

// ---------- 3. Host's own rebuy ----------

test('host rebuy: granted at once without approval, never listed for others, same limit applies', async t => {
  const app = await setup(t);
  const { host, hostId, guests: [b] } = await table(app);
  host.send({ type: 'requestRebuy', amount: 400, clientRequestId: '00000000-0000-4000-a000-000000000001' });
  const mine = await host.room(r => r.rebuyNotice?.requestId === '00000000-0000-4000-a000-000000000001');
  assert.equal(player(mine, hostId).stack, 1400);
  assert.deepEqual({ approved: mine.rebuyNotice!.approved, applied: mine.rebuyNotice!.applied }, { approved: true, applied: true });
  assert.deepEqual(mine.rebuyRequests, [], 'no approval queue entry');
  const seen = await b.peer.room(r => player(r, hostId).stack === 1400);
  assert.deepEqual(seen.rebuyRequests, [], 'other players see no host request');
  host.send({ type: 'requestRebuy', amount: 1001 });
  assert.equal((await host.error()).code, 'REBUY_REQUEST_INVALID', 'limit applies to the host');
});

test('host rebuy during a hand the host is in: held, then added once after the hand', async t => {
  const app = await setup(t);
  const { host, hostId, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  host.send({ type: 'requestRebuy', amount: 600, clientRequestId: '00000000-0000-4000-a000-000000000002' });
  const held = await host.room(r => player(r, hostId).pendingChips === 600);
  assert.equal(held.holdem!.players.find(p => p.id === hostId)!.stack, 990, 'hand stack untouched');
  assert.equal(total(held), 2000, 'chips in play unchanged');
  host.send({ type: 'act', handId: hand.id, revision: held.holdem!.revision, action: 'fold' });
  const done = await b.peer.room(r => r.holdem?.street === 'complete' && player(r, hostId).pendingChips === 0);
  assert.equal(player(done, hostId).stack, 990 + 600);
  assert.equal(total(done), 2600);
});

test('duplicate host request (resend, same id) grants once; a reconnect resend grants nothing; player resend makes one request', async t => {
  const app = await setup(t);
  const { host, hostId, guests: [b] } = await table(app);
  host.send({ type: 'requestRebuy', amount: 250, clientRequestId: '00000000-0000-4000-a000-000000000003' });
  host.send({ type: 'requestRebuy', amount: 250, clientRequestId: '00000000-0000-4000-a000-000000000003' });
  await host.room(r => player(r, hostId).stack === 1250);
  await sleep(100);
  const back = await reconnect(app, 'a:s1');
  back.peer.send({ type: 'requestRebuy', amount: 250, clientRequestId: '00000000-0000-4000-a000-000000000003' });
  await sleep(100);
  let now = await current(back.peer, back.joined.room);
  assert.equal(player(now, hostId).stack, 1250, 'granted exactly once');
  // Player resend with the same id: one waiting request; after the decision the resend does nothing.
  b.peer.send({ type: 'requestRebuy', amount: 100, clientRequestId: '00000000-0000-4000-a000-000000000004' });
  b.peer.send({ type: 'requestRebuy', amount: 100, clientRequestId: '00000000-0000-4000-a000-000000000004' });
  const pending = await back.peer.room(r => r.rebuyRequests?.length === 1);
  back.peer.send({ type: 'resolveRebuyRequest', requestId: pending.rebuyRequests![0].id, approve: true });
  await b.peer.room(r => player(r, b.id).stack === 1100);
  b.peer.send({ type: 'requestRebuy', amount: 100, clientRequestId: '00000000-0000-4000-a000-000000000004' });
  await sleep(100);
  now = await current(back.peer, now);
  assert.deepEqual(now.rebuyRequests, [], 'no new request from the resend');
  assert.equal(player(now, b.id).stack, 1100);
});
