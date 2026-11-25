import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyPendingRebuys, requestRebuy, resolveRebuyRequest, type RebuyRoom } from '../src/rebuy.ts';
import { memoryStore, player, reconnect, rebuy, seatOf, setup, sleep, table, total, type Joined } from './support/seat-harness.ts';

// FT-FEAT-005 rebuy policy C and FT-FEAT-006 next-hand participation.

test('request → host sees requester, current chips, amount and expected balance → approve adds once', async t => {
  const app = await setup(t);
  const { host, guests: [b] } = await table(app);
  b.peer.send({ type: 'requestRebuy', amount: 700 });
  const pending = await host.room(r => (r.rebuyRequests?.length ?? 0) === 1);
  const view = pending.rebuyRequests![0];
  assert.deepEqual({ nickname: view.nickname, stack: view.stack, amount: view.amount, pendingChips: view.pendingChips, expectedStack: view.expectedStack },
    { nickname: 'B', stack: 1000, amount: 700, pendingChips: 0, expectedStack: 1700 });
  assert.equal(player(pending, b.id).stack, 1000, 'a request alone grants nothing');
  host.send({ type: 'resolveRebuyRequest', requestId: view.id, approve: true });
  const granted = await b.peer.room(r => r.rebuyNotice?.requestId === view.id);
  assert.equal(player(granted, b.id).stack, 1700);
  assert.deepEqual({ approved: granted.rebuyNotice!.approved, applied: granted.rebuyNotice!.applied, amount: granted.rebuyNotice!.amount }, { approved: true, applied: true, amount: 700 });
  assert.deepEqual(granted.rebuyRequests, []);
  // Double tap / resend of the same approval: nothing more.
  host.send({ type: 'resolveRebuyRequest', requestId: view.id, approve: true });
  assert.equal((await host.error()).code, 'REBUY_REQUEST_INVALID');
  await sleep(50);
  const again = await reconnect(app, 'b:s1');
  assert.equal(player(again.joined.room, b.id).stack, 1700, 'reconnect does not grant again');
  assert.equal(again.joined.room.rebuyNotice?.requestId, view.id, 'decision survives a refresh');
});

test('reject keeps chips; cancel removes the request; one pending request per player; host-only decisions', async t => {
  const app = await setup(t);
  const { host, guests: [b, c] } = await table(app, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  const { room: rejected } = await rebuy(host, b.peer, b.id, 300, false);
  assert.equal(player(rejected, b.id).stack, 1000);
  assert.equal(rejected.rebuyNotice?.approved, false);
  b.peer.send({ type: 'requestRebuy', amount: 100 });
  await host.room(r => r.rebuyRequests?.length === 1);
  b.peer.send({ type: 'requestRebuy', amount: 200 });
  assert.equal((await b.peer.error()).code, 'REBUY_REQUEST_INVALID', 'no second pending request');
  const pending = (await c.peer.room(r => r.rebuyRequests?.length === 1)).rebuyRequests![0];
  c.peer.send({ type: 'resolveRebuyRequest', requestId: pending.id, approve: true });
  assert.equal((await c.peer.error()).code, 'REBUY_REQUEST_INVALID', 'only the host decides');
  b.peer.send({ type: 'cancelRebuyRequest' });
  const cancelled = await host.room(r => r.rebuyRequests?.length === 0);
  assert.equal(player(cancelled, b.id).stack, 1000);
  host.send({ type: 'resolveRebuyRequest', requestId: pending.id, approve: true });
  assert.equal((await host.error()).code, 'REBUY_REQUEST_INVALID', 'cancelled request cannot be approved');
  assert.equal(player(await b.peer.room(() => true).catch(() => cancelled), b.id).stack ?? 1000, 1000);
});

test('amount must be a positive integer within the limit; client chip fields are ignored', async t => {
  const app = await setup(t);
  const { host, guests: [b] } = await table(app);
  for (const amount of [0, -5, 1.5, 1_000_000_001, Number.NaN]) {
    b.peer.send({ type: 'requestRebuy', amount });
    assert.equal((await b.peer.error()).code, amount === amount ? 'REBUY_REQUEST_INVALID' : 'INVALID_REQUEST', String(amount));
  }
  b.peer.send({ type: 'requestRebuy', amount: '500' });
  assert.equal((await b.peer.error()).code, 'INVALID_REQUEST');
  const { room } = await rebuy(host, b.peer, b.id, 250);
  assert.equal(player(room, b.id).stack, 1250);
  b.peer.send({ type: 'requestRebuy', amount: 10, stack: 999_999, expectedStack: 999_999 });
  const req = (await host.room(r => r.rebuyRequests?.length === 1)).rebuyRequests![0];
  assert.equal(req.stack, 1250, 'server balance, not the client value');
});

test('approval during a hand waits for that hand to end; pot and settlement untouched; next hand uses the new balance', async t => {
  const app = await setup(t, { nextHandMs: 40 });
  const { host, hostId, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  const { room: during } = await rebuy(host, b.peer, b.id, 500);
  assert.equal(during.holdem!.id, hand.id);
  assert.equal(player(during, b.id).pendingChips, 500, 'held until the hand ends');
  assert.equal(during.rebuyNotice!.applied, false);
  assert.equal(during.holdem!.players.find(p => p.id === b.id)!.stack, 980, 'in-hand stack unchanged (BB posted)');
  assert.equal(total(during), 2000, 'chips in play unchanged');
  host.send({ type: 'act', handId: hand.id, revision: during.holdem!.revision, action: 'fold' });
  const done = await b.peer.room(r => r.holdem?.id === hand.id && r.holdem.street === 'complete' && player(r, b.id).pendingChips === 0);
  assert.equal(player(done, b.id).stack, 1010 + 500, 'settled result + grant');
  assert.equal(done.holdem!.players.find(p => p.id === b.id)!.stack, 1010, 'hand record keeps the real result');
  assert.equal(done.rebuyNotice!.applied, true);
  assert.equal(total(done), 2500);
  const next = await host.room(r => !!r.holdem && r.holdem.id !== hand.id, 3000);
  const bNext = next.holdem!.players.find(p => p.id === b.id)!;
  assert.equal(bNext.stack + bNext.totalBet, 1510, 'next hand starts from the new balance');
  assert.equal(next.holdem!.players.find(p => p.id === hostId)!.stack + next.holdem!.players.find(p => p.id === hostId)!.totalBet, 990);
});

test('approval during a hand for someone not in it (spectator) applies immediately', async t => {
  const app = await setup(t);
  const { host, code, guests: [b] } = await table(app);
  const c = await app.connect('c:s1');
  c.send({ type: 'join', code, nickname: 'C' });
  const joined = await c.next('joined') as Joined;
  host.send({ type: 'startHand', previousHandId: null });
  await host.room(r => !!r.holdem);
  const { room } = await rebuy(host, c, joined.playerId, 400);
  assert.equal(player(room, joined.playerId).stack, 1400);
  assert.equal(player(room, joined.playerId).pendingChips, 0);
  assert.equal(room.rebuyNotice!.applied, true);
  void b;
});

test('seated rebuy, stand-up, unseated rebuy and re-seat with or without extra chips', async t => {
  const app = await setup(t);
  const { host, guests: [b, c] } = await table(app, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  await rebuy(host, b.peer, b.id, 100); // seated, no hand → immediate
  b.peer.send({ type: 'standUp' });
  await host.room(r => seatOf(r, b.id) === null);
  const { room: unseated } = await rebuy(host, b.peer, b.id, 200);
  assert.equal(player(unseated, b.id).stack, 1300);
  assert.equal(seatOf(unseated, b.id), null, 'a rebuy never seats');
  b.peer.send({ type: 'requestSeat', seat: 4 });
  const seatReq = (await host.room(r => r.seatRequests?.length === 1)).seatRequests![0];
  assert.equal(seatReq.kind, 'resit');
  host.send({ type: 'resolveSeatRequest', requestId: seatReq.id, approve: true });
  const back = await b.peer.room(r => seatOf(r, b.id) === 4);
  assert.equal(player(back, b.id).stack, 1300, 'seat approval grants nothing');
  // Re-seat with the existing balance only.
  c.peer.send({ type: 'standUp' });
  await host.room(r => seatOf(r, c.id) === null);
  c.peer.send({ type: 'requestSeat', seat: 5 });
  const cReq = (await host.room(r => r.seatRequests?.length === 1)).seatRequests![0];
  host.send({ type: 'resolveSeatRequest', requestId: cReq.id, approve: true });
  const cBack = await c.peer.room(r => seatOf(r, c.id) === 5);
  assert.equal(player(cBack, c.id).stack, 1000);
});

test('busted player: rebuy approved, dealt in from the next hand', async t => {
  // Deterministic bust: B seated with 0 chips (as after losing an all-in), restored from a checkpoint.
  const store = memoryStore();
  const first = await setup(t, { store });
  const { guests: [b0] } = await table(first, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  await first.close();
  const saved = structuredClone(store.saved!);
  const bSaved = saved.rooms[0].players.find(p => p.id === b0.id)!;
  bSaved.stack = 0;
  const app = await setup(t, { store: memoryStore(saved), nextHandMs: 40 });
  const a = await reconnect(app, 'a:s1'), b = await reconnect(app, 'b:s1'), c = await reconnect(app, 'c:s1');
  a.peer.send({ type: 'startHand', previousHandId: null });
  const hand = (await a.peer.room(r => !!r.holdem)).holdem!;
  assert.ok(!hand.players.some(p => p.id === b0.id), 'no chips: not dealt');
  const { room } = await rebuy(a.peer, b.peer, b0.id, 1000);
  assert.equal(player(room, b0.id).stack, 1000, 'not in the hand: applied at once');
  const turn = await a.peer.room(r => r.holdem?.id === hand.id && !!r.holdem.actorId);
  const actor = turn.holdem!.actorId === a.joined.playerId ? a.peer : c.peer;
  actor.send({ type: 'act', handId: hand.id, revision: turn.holdem!.revision, action: 'fold' });
  const next = await a.peer.room(r => !!r.holdem && r.holdem.id !== hand.id, 3000);
  assert.ok(next.holdem!.players.some(p => p.id === b0.id), 'dealt in after the rebuy');
  assert.equal(total(next), 3000, '2000 + 1000 granted');
});

test('seat approval, rebuy, stand-up and a disconnect in the same hand settle cleanly at the boundary', async t => {
  const app = await setup(t, { nextHandMs: 40 });
  const { host, hostId, code, guests: [b, c] } = await table(app, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  const d = await app.connect('d:s1');
  d.send({ type: 'join', code, nickname: 'D' });
  const dj = await d.next('joined') as Joined;
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  // During hand 1: D asks for seat 3 and +300; B stands up and gets +200; C disconnects.
  d.send({ type: 'requestSeat', seat: 3 });
  const dReq = (await host.room(r => r.seatRequests?.length === 1)).seatRequests![0];
  host.send({ type: 'resolveSeatRequest', requestId: dReq.id, approve: true });
  await rebuy(host, d, dj.playerId, 300);
  b.peer.send({ type: 'standUp' });
  await host.room(r => player(r, b.id).standingUp === true);
  await rebuy(host, b.peer, b.id, 200);
  c.peer.socket.terminate();
  const mid = await host.room(r => player(r, c.id).connected === false);
  assert.ok(!mid.holdem!.players.some(p => p.id === dj.playerId), 'D not in the running hand');
  assert.equal(player(mid, dj.playerId).stack, 1300, 'D not in the hand → applied now');
  assert.equal(player(mid, b.id).pendingChips, 200);
  // Finish hand 1: A folds; B is next and folds; C (offline) wins or is checked through.
  for (let i = 0; i < 20; i++) {
    const r = host.latest() ?? mid;
    if (r.holdem?.street === 'complete' || r.holdem?.id !== hand.id) break;
    const actor = r.holdem!.actorId;
    const who = actor === hostId ? host : actor === b.id ? b.peer : null;
    if (who) who.send({ type: 'act', handId: hand.id, revision: r.holdem!.revision, action: 'fold' });
    await sleep(40);
  }
  const done = await host.room(r => r.holdem?.id === hand.id && r.holdem.street === 'complete' && seatOf(r, b.id) === null, 3000);
  assert.equal(player(done, b.id).pendingChips, 0);
  assert.equal(total(done), 4000 + 300 + 200, 'all grants counted exactly once');
  const next = await host.room(r => !!r.holdem && r.holdem.id !== hand.id, 3000);
  const dealt = next.holdem!.players.map(p => p.id).sort();
  assert.deepEqual(dealt, [hostId, dj.playerId].sort(), 'B stood up, C offline: only A and the newly approved D');
  assert.equal(seatOf(next, c.id), 2, 'C seat still held inside 3 minutes');
});

test('pending grants (player and host) and requests survive a restart and are applied once after the restored hand', async t => {
  const store = memoryStore();
  const first = await setup(t, { store });
  const { host, hostId, guests: [b] } = await table(first);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  await rebuy(host, b.peer, b.id, 500);
  b.peer.send({ type: 'requestRebuy', amount: 50 }); // still waiting for the host at restart
  await host.room(r => r.rebuyRequests?.length === 1);
  host.send({ type: 'requestRebuy', amount: 70, clientRequestId: '00000000-0000-4000-a000-000000000005' }); // host: no approval, held (in hand)
  await host.room(r => player(r, hostId).pendingChips === 70);
  await first.close();
  assert.equal(store.saved!.rooms[0].players.find(p => p.id === b.id)!.pendingRebuy, 500);
  assert.equal(store.saved!.rooms[0].rebuyLog!.length, 2, 'B (approved) + host (self)');
  const store2 = memoryStore(structuredClone(store.saved!));
  const second = await setup(t, { store: store2 });
  const a2 = await reconnect(second, 'a:s1');
  const b2 = await reconnect(second, 'b:s1');
  assert.equal(player(a2.joined.room, b.id).pendingChips, 500);
  assert.equal(player(a2.joined.room, hostId).pendingChips, 70);
  a2.peer.send({ type: 'requestRebuy', amount: 70, clientRequestId: '00000000-0000-4000-a000-000000000005' }); // resend after restart: no second grant
  assert.equal(a2.joined.room.rebuyRequests!.length, 1, 'pending request kept');
  a2.peer.send({ type: 'act', handId: hand.id, revision: a2.joined.room.holdem!.revision, action: 'fold' });
  const done = await b2.peer.room(r => r.holdem?.street === 'complete' && player(r, b.id).pendingChips === 0);
  assert.equal(player(done, b.id).stack, 1510);
  assert.equal(player(done, hostId).stack, 990 + 70, 'host grant applied once');
  // Another restart after the hand: the grant is not applied twice.
  await second.close();
  const third = await setup(t, { store: memoryStore(structuredClone(store2.saved!)) });
  const b3 = await reconnect(third, 'b:s1');
  assert.equal(player(b3.joined.room, b.id).stack, 1510);
  assert.equal(player(b3.joined.room, hostId).stack, 1060);
  assert.equal(b3.joined.room.rebuyRequests!.length, 1, 'B request still waiting');
});

test('leaving with an approved-but-unapplied grant keeps it for the same account', async t => {
  const app = await setup(t);
  const { host, code, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  await host.room(r => !!r.holdem);
  await rebuy(host, b.peer, b.id, 300);
  b.peer.send({ type: 'leave' });
  await b.peer.next('left');
  const done = await host.room(r => r.holdem?.street === 'complete');
  const back = await app.connect('b:s1');
  back.send({ type: 'join', code, nickname: 'B' });
  const joined = await back.next('joined') as Joined;
  const settled = done.holdem!.players.find(p => p.id === b.id)!.stack; // includes the engine's uncalled-bet refund
  assert.equal(player(joined.room, b.id).stack, settled + 300, 'settled balance + approved grant, once');
  assert.equal(total(joined.room), total(done) + settled + 300);
});

test('rebuy module: removed before anything else, so a decision applies once', () => {
  const room: RebuyRoom = { hostId: 'h', rebuyRequests: [], rebuyLog: [], rebuySeen: [], players: [{ id: 'h', nickname: 'H', stack: 0 }, { id: 'g', nickname: 'G', stack: 10 }] };
  const [h, g] = room.players;
  assert.deepEqual(requestRebuy(room, g, 90, 1000), { ok: true });
  const id = room.rebuyRequests[0].id;
  assert.equal(resolveRebuyRequest(room, g, id, true, () => false).ok, false, 'not host');
  assert.equal(resolveRebuyRequest(room, h, id, true, () => true).ok, true);
  assert.equal(g.stack, 10); assert.equal(g.pendingRebuy, 90);
  assert.equal(resolveRebuyRequest(room, h, id, true, () => false).ok, false, 'single use');
  assert.equal(applyPendingRebuys(room, () => true), false, 'still in hand');
  assert.equal(applyPendingRebuys(room, () => false), true);
  assert.equal(applyPendingRebuys(room, () => false), false, 'applied once');
  assert.equal(g.stack, 100); assert.equal(room.rebuyLog.length, 1); assert.ok(room.rebuyLog[0].appliedAt);
});
