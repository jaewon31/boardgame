import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { serverConfig } from '../src/config.ts';
import { memoryStore, player, reconnect, rebuy, seatOf, setup, sleep, stubAuth, table, total, type Joined } from './support/seat-harness.ts';

// FT-FEAT-003 (other-device reconnect, old session invalidation, hold length) and FT-BUG-004
// (a confirmed disconnect on turn is checked or folded at once).

test('same account on another device (new session) gets seat and chips back without approval; the old login is closed', async t => {
  const revoked = new Set<string>();
  const app = await setup(t, { authorize: stubAuth({ revoked }) });
  const { host, guests: [b] } = await table(app);
  const closed = once(b.peer.socket, 'close');
  revoked.add('b:s1'); // the auth server keeps one session per account
  const phone = await reconnect(app, 'b:s2');
  assert.equal(phone.joined.playerId, b.id);
  assert.equal(seatOf(phone.joined.room, b.id), 1);
  assert.equal(player(phone.joined.room, b.id).stack, 1000);
  assert.deepEqual(phone.joined.room.seatRequests, [], 'no approval needed');
  assert.deepEqual(phone.joined.room.seatRestore && { seat: phone.joined.room.seatRestore.seat, stack: phone.joined.room.seatRestore.stack }, { seat: 1, stack: 1000 });
  assert.equal((await closed)[0], 4003, 'old login closed');
  const seen = await host.room(r => player(r, b.id).connected === true);
  assert.equal(seen.players.length, 2, 'still one member for the account');
});

test('another device can also come back through the invite code while the first device is offline', async t => {
  const app = await setup(t);
  const { host, code, guests: [b] } = await table(app);
  b.peer.socket.terminate();
  await host.room(r => player(r, b.id).connected === false);
  const tablet = await app.connect('b:tablet');
  tablet.send({ type: 'join', code, nickname: 'B 태블릿' });
  const joined = await tablet.next('joined') as Joined;
  assert.equal(joined.playerId, b.id);
  assert.equal(seatOf(joined.room, b.id), 1);
  assert.equal(player(joined.room, b.id).nickname, 'B', 'same member, nickname unchanged');
  assert.ok(joined.room.seatRestore, 'restore notice for the new device');
});

test('messages from the replaced session arriving late cannot change the game', async t => {
  const slow = new Map<string, number>();
  const app = await setup(t, { authorize: stubAuth({ slow }) });
  const { host, hostId, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  assert.equal(hand.actorId, hostId);
  // The old phone sends "fold" but its auth is slow; meanwhile the host signs in on a laptop.
  slow.set('a:s1', 150);
  host.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'fold' });
  await sleep(20);
  const laptop = await reconnect(app, 'a:laptop');
  assert.equal(laptop.joined.playerId, hostId);
  await sleep(250);
  const now = (await (async () => { laptop.peer.send({ type: 'ping', id: 1 }); await laptop.peer.next('pong'); return laptop.peer.latest() ?? laptop.joined.room; })());
  assert.equal(now.holdem!.revision, hand.revision, 'late fold from the old session ignored');
  assert.equal(now.holdem!.actorId, hostId);
  // The new session plays the turn normally.
  laptop.peer.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'call' });
  const after = await b.peer.room(r => (r.holdem?.revision ?? 0) > hand.revision);
  assert.equal(after.holdem!.players.find(p => p.id === hostId)!.folded, false);
  assert.equal(after.holdem!.actorId, b.id);
});

test('a confirmed disconnect folds at once when facing a bet, checks when it may, and plays only on its own turn', async t => {
  const app = await setup(t);
  const { host, hostId, guests: [b, c] } = await table(app, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  // 3-handed: A dealer acts first preflop, then B (SB), then C (BB).
  assert.equal(hand.actorId, hostId);
  // C disconnects while it is not C's turn: nothing happens yet.
  c.peer.socket.terminate();
  const away = await host.room(r => player(r, c.id).connected === false);
  assert.equal(away.holdem!.revision, hand.revision, 'not on turn: no action');
  host.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'call' });
  const bTurn = await b.peer.room(r => r.holdem?.actorId === b.id);
  b.peer.send({ type: 'act', handId: hand.id, revision: bTurn.holdem!.revision, action: 'call' });
  // C (BB) may check → checked at once; flop: B (SB) acts first.
  const flop = await host.room(r => r.holdem?.street === 'flop');
  const cSeat = flop.holdem!.players.find(p => p.id === c.id)!;
  assert.equal(cSeat.folded, false, 'checked, not folded');
  assert.equal(flop.holdem!.actorId, b.id);
  assert.equal(total(flop), 3000);
  // B bets; A calls; C must fold at once (cannot check).
  b.peer.send({ type: 'act', handId: hand.id, revision: flop.holdem!.revision, action: 'raise', amount: 40 });
  const aTurn = await host.room(r => r.holdem?.actorId === hostId && r.holdem.street === 'flop');
  host.send({ type: 'act', handId: hand.id, revision: aTurn.holdem!.revision, action: 'call' });
  const turn = await host.room(r => r.holdem?.street === 'turn');
  assert.equal(turn.holdem!.players.find(p => p.id === c.id)!.folded, true, 'folded when facing a bet');
  assert.equal(total(turn), 3000, 'pot and stacks intact');
  assert.equal(seatOf(turn, c.id), 2, 'seat still held');
});

test('a connected but silent player is not folded early (network delay is not a disconnect)', async t => {
  const app = await setup(t, { turnMs: 10_000 });
  const { host, hostId, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  assert.equal(hand.actorId, hostId);
  await sleep(400);
  b.peer.send({ type: 'ping', id: 7 });
  await b.peer.next('pong');
  const changed = b.peer.queue.some(m => m.type === 'room' && !!m.room.holdem && m.room.holdem.revision !== hand.revision);
  assert.equal(changed, false, 'no automatic action while connected');
});

test('after reconnecting, the player acts normally from the next turn', async t => {
  const app = await setup(t);
  const { host, hostId, guests: [b] } = await table(app);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  host.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'call' });
  await host.room(r => r.holdem?.actorId === b.id);
  b.peer.socket.terminate();
  // B (BB option) is checked at once; flop: B first again → checked; then A.
  const flop = await host.room(r => r.holdem?.street === 'flop' && r.holdem.actorId === hostId);
  const back = await reconnect(app, 'b:s1');
  assert.equal(seatOf(back.joined.room, b.id), 1);
  host.send({ type: 'act', handId: hand.id, revision: flop.holdem!.revision, action: 'raise', amount: 20 });
  const mine = await back.peer.room(r => r.holdem?.actorId === b.id);
  back.peer.send({ type: 'act', handId: hand.id, revision: mine.holdem!.revision, action: 'call' });
  const turn = await host.room(r => r.holdem?.street === 'turn');
  assert.equal(turn.holdem!.players.find(p => p.id === b.id)!.folded, false, 'manual call accepted');
  assert.equal(total(turn), 2000);
});

test('side pot with a disconnected player: auto-fold keeps pots and payouts exact', async t => {
  const app = await setup(t);
  const { host, hostId, guests: [b, c] } = await table(app, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  await rebuy(host, b.peer, b.id, 500);
  await rebuy(host, c.peer, c.id, 1000);
  host.clear();
  host.send({ type: 'startHand', previousHandId: null });
  const started = await host.room(r => !!r.holdem);
  const hand = started.holdem!;
  assert.equal(total(started), 4500, '1000 + 1500 + 2000 after rebuys');
  c.peer.socket.terminate();
  await host.room(r => player(r, c.id).connected === false);
  host.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'allIn' });
  const bTurn = await b.peer.room(r => r.holdem?.actorId === b.id);
  b.peer.send({ type: 'act', handId: hand.id, revision: bTurn.holdem!.revision, action: 'allIn' });
  const done = await host.room(r => r.holdem?.id === hand.id && r.holdem.street === 'complete', 4000);
  assert.equal(done.holdem!.players.find(p => p.id === c.id)!.folded, true, 'C folded facing the all-ins');
  assert.equal(total(done), 4500, 'every chip accounted for');
  const paid = done.holdem!.payouts.reduce((s, p) => s + p.amount, 0);
  assert.ok(paid > 0);
  assert.equal(player(done, c.id).stack, 2000 - 20, 'C lost only the big blind');
});

test('membership grace running out mid-hand waits for the hand to end instead of folding the player', async t => {
  const app = await setup(t, { seatRetentionMs: 80, seatHoldMs: 80 });
  const { host, hostId, guests: [b, c] } = await table(app, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  c.peer.socket.terminate(); // C is BB, not on turn
  await sleep(250); // grace over, but C is still in the hand
  host.clear();
  host.send({ type: 'act', handId: hand.id, revision: hand.revision, action: 'call' });
  const mid = await host.room(r => r.holdem?.actorId === b.id);
  assert.ok(mid.players.some(p => p.id === c.id), 'not removed during the hand');
  b.peer.send({ type: 'act', handId: hand.id, revision: mid.holdem!.revision, action: 'raise', amount: 60 });
  // C must call 40 → folded at once; A folds → B wins; hand over → C leaves the room.
  const aTurn = await host.room(r => r.holdem?.actorId === hostId);
  host.send({ type: 'act', handId: hand.id, revision: aTurn.holdem!.revision, action: 'fold' });
  const gone = await host.room(r => r.holdem?.street === 'complete' && !r.players.some(p => p.id === c.id));
  assert.equal(gone.players.length, 2);
  assert.equal(total(gone) + 980, 3000, 'C kept 980 in the room ledger (lost the big blind only)');
});

test('RECONNECT_MS below three minutes is raised to 180000 so the seat hold is never shorter', () => {
  assert.equal(serverConfig({ RECONNECT_MS: '30000' }).reconnectMs, 180_000);
  assert.equal(serverConfig({ RECONNECT_MS: '179999' }).reconnectMs, 180_000);
  assert.equal(serverConfig({}).reconnectMs, 300_000);
  assert.equal(serverConfig({ RECONNECT_MS: '600000' }).reconnectMs, 600_000);
  assert.throws(() => serverConfig({ RECONNECT_MS: '1000' }), /RECONNECT_MS/, 'existing range check kept');
});

test('production-like grace of 180000: seat hold is the full three minutes', async t => {
  const app = await setup(t, { reconnectMs: 180_000, seatRetentionMs: undefined });
  const { host, guests: [b] } = await table(app);
  const before = Date.now();
  b.peer.socket.terminate();
  const away = await host.room(r => player(r, b.id).connected === false);
  assert.ok(player(away, b.id).seatHeldUntil! >= before + 180_000);
});

test('restart: restored offline players are not auto-folded during the recovery window, and the hold is not extended', async t => {
  const store = memoryStore();
  const first = await setup(t, { store });
  const { host, hostId } = await table(first);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  await first.close();
  const saved = store.saved!;
  const second = await setup(t, { store: memoryStore(structuredClone(saved)) });
  await sleep(200);
  const back = await reconnect(second, 'a:s1');
  assert.equal(back.joined.room.holdem!.revision, hand.revision, 'no automatic action right after restart');
  assert.equal(back.joined.room.holdem!.actorId, hostId);
  const until = back.joined.room.players.find(p => p.seat === 1)!.seatHeldUntil!;
  assert.ok(until <= saved.savedAt + 180_000, 'hold counted from the last save');
});
