import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serverConfig } from '../src/config.ts';
import { createSeatEvents } from '../src/seatEvents.ts';
import { memoryStore, player, reconnect, rebuy, seatOf, setup, sleep, table, type Joined, type Peer } from './support/seat-harness.ts';
import type { LobbyRoom } from '@boardgame/shared';

// Pre-deployment diagnostics (2026-11-25): six seat event types and the per-hand chip audit.
type Entry = Record<string, unknown>;
const capture = () => { const logs: Entry[] = []; return { logs, sink: (e: Entry) => { logs.push(e); } }; };
const of = (logs: Entry[], event: string, extra: Entry = {}) => logs.filter(e => e.event === event && Object.entries(extra).every(([k, v]) => e[k] === v));
async function finishHand(host: Peer, others: Peer[], handId: string) {
  for (let i = 0; i < 40; i++) {
    const room = [host, ...others].map(p => p.latest()).find(r => r?.holdem?.id === handId);
    if (room?.holdem?.street === 'complete') return room;
    if (room?.holdem?.actorId) for (const p of [host, ...others]) p.send({ type: 'act', handId, revision: room.holdem.revision, action: 'fold' });
    await sleep(30);
  }
  return undefined;
}

test('each seat event is logged once with hashed refs only', async t => {
  const { logs, sink } = capture();
  const app = await setup(t, { seatEvents: sink, offlineGraceMs: 100, seatHoldMs: 400, seatRetentionMs: 10_000 });
  const { host, hostId, guests: [b, c] } = await table(app, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  host.send({ type: 'startHand', previousHandId: null });
  const hand = (await host.room(r => !!r.holdem)).holdem!;
  assert.equal(hand.actorId, hostId);
  // Host drops on turn → hold started, auto fold after the grace.
  host.socket.terminate();
  await b.peer.room(r => r.holdem?.actorId === b.id, 3000);
  assert.equal(of(logs, 'seat_hold', { phase: 'started' }).length, 1);
  const auto = of(logs, 'auto_action');
  assert.equal(auto.length, 1); assert.equal(auto[0].action, 'fold'); assert.ok(Number(auto[0].offlineMs) >= 90);
  // Host comes back on another device inside the hold → takeover + reclaim.
  const a2 = (await reconnect(app, 'a:laptop')).peer;
  assert.equal(of(logs, 'seat_hold', { phase: 'reclaimed' }).length, 1);
  // Takeover is logged when the account's membership moves sessions (old socket already closed here).
  assert.equal(of(logs, 'membership_takeover').length, 1);
  // C stands up during the hand; B rebuys (held); host self-rebuy (held? host folded but still in hand).
  c.peer.send({ type: 'standUp' });
  await a2.room(r => player(r, c.id).standingUp === true);
  await rebuy(a2, b.peer, b.id, 300);
  b.peer.send({ type: 'requestRebuy', amount: 50 }); b.peer.send({ type: 'cancelRebuyRequest' });
  await a2.room(r => (r.rebuyRequests?.length ?? 1) === 0 && player(r, b.id).pendingChips === 300);
  a2.send({ type: 'requestRebuy', amount: 100, clientRequestId: '00000000-0000-4000-a000-0000000000f1' });
  a2.send({ type: 'requestRebuy', amount: 100, clientRequestId: '00000000-0000-4000-a000-0000000000f1' });
  await a2.room(r => r.rebuyNotice?.requestId === '00000000-0000-4000-a000-0000000000f1');
  await sleep(50);
  const done = await finishHand(a2, [b.peer, c.peer], hand.id);
  assert.ok(done);
  await a2.room(r => seatOf(r, c.id) === null && player(r, b.id).pendingChips === 0);
  assert.equal(of(logs, 'seat_released', { reason: 'voluntary' }).length, 1);
  const rebuys = of(logs, 'rebuy').map(e => e.phase).sort();
  assert.deepEqual(rebuys, ['applied', 'applied', 'approved', 'cancelled', 'duplicate_ignored', 'host_granted', 'requested', 'requested'].sort());
  const audit = of(logs, 'chip_audit', { phase: 'hand' });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].ok, true, JSON.stringify(audit[0]));
  assert.equal(audit[0].expected, 3000 + 300 + 100);
  // B drops off-hand → hold expires → released ('expired').
  b.peer.socket.terminate();
  await a2.room(r => seatOf(r, b.id) === null, 3000);
  assert.equal(of(logs, 'seat_hold', { phase: 'expired' }).length, 1);
  assert.equal(of(logs, 'seat_released', { reason: 'expired' }).length, 1);
  // Lowering the rebuy limit drops a waiting request (logged).
  c.peer.send({ type: 'requestRebuy', amount: 800 });
  const pending = await a2.room(r => r.rebuyRequests?.length === 1);
  a2.send({ type: 'resetChips', handId: done.holdem!.id });
  const lobby = await a2.room(r => !r.holdem && r.rebuyRequests?.length === 1);
  a2.send({ type: 'updateSettings', settings: { ...lobby.settings, maxRebuy: 500 }, expectedRevision: lobby.settingsRevision });
  await a2.next('settingsUpdated');
  assert.equal(of(logs, 'rebuy', { phase: 'dropped_limit' }).length, 1);
  const reset = of(logs, 'chip_audit', { phase: 'baseline', reason: 'chip_reset' });
  assert.equal(reset.length, 1);
  assert.equal(reset[0].expected, 3000, 'reset re-bases to 3 × starting chips');
  void pending;
  // Every entry: event + level + timestamp + refs/numbers only.
  for (const e of logs) {
    assert.ok(typeof e.roomRef === 'string' && /^[0-9a-f]{16}$/.test(e.roomRef as string), JSON.stringify(e));
    if (e.accountRef !== undefined) assert.match(String(e.accountRef), /^([0-9a-f]{16}|anon)$/);
  }
});

test('logs never contain nicknames, room codes, account or session ids, tokens or cards', async t => {
  const { logs, sink } = capture();
  const app = await setup(t, { seatEvents: sink, offlineGraceMs: 50, seatHoldMs: 200 });
  const a = await app.connect('acct-SECRETA:sess-SECRETA'), b = await app.connect('acct-SECRETB:sess-SECRETB');
  a.send({ type: 'create', nickname: '비밀방장닉', game: 'holdem' });
  const host = await a.next('joined') as Joined;
  a.send({ type: 'requestSeat', seat: 0 });
  b.send({ type: 'join', code: host.room.code, nickname: '비밀손님닉' });
  const guest = await b.next('joined') as Joined;
  b.send({ type: 'requestSeat', seat: 1 });
  const req = (await a.room(r => r.seatRequests?.length === 1)).seatRequests![0];
  a.send({ type: 'resolveSeatRequest', requestId: req.id, approve: true });
  await b.room(r => seatOf(r, guest.playerId) === 1);
  a.send({ type: 'startHand', previousHandId: null });
  const started = await b.room(r => !!r.holdem);
  const myCards = (started.holdem!.players.find(p => p.id === guest.playerId)!.cards ?? []).map(c => JSON.stringify(c));
  await rebuy(a, b, guest.playerId, 200);
  a.socket.terminate();
  await b.room(r => r.holdem?.street === 'complete', 3000);
  const text = JSON.stringify(logs);
  assert.ok(logs.length >= 4, text);
  for (const secret of ['비밀방장닉', '비밀손님닉', host.room.code, 'acct-SECRETA', 'acct-SECRETB', 'sess-SECRETA', 'sess-SECRETB', host.token, guest.token, host.playerId, guest.playerId])
    assert.ok(!text.includes(secret), `leaked: ${secret}`);
  for (const card of myCards) assert.ok(!text.includes(card), 'no card values');
  for (const e of logs) for (const key of Object.keys(e)) assert.ok(!/card|hole|board|nickname|token|code$/i.test(key), `field ${key}`);
});

test('chip audit stays exact through joins, leaves, rejoins, rebuys (held, immediate, host), stand-ups and resets', async t => {
  const { logs, sink } = capture();
  const app = await setup(t, { seatEvents: sink, nextHandMs: 40 });
  const { host, code, guests: [b, c] } = await table(app, [['b:s1', 'B', 1], ['c:s1', 'C', 2]]);
  let previous: string | null = null, number = 0;
  const play = async (during: () => Promise<void>) => {
    if (previous === null) host.send({ type: 'startHand', previousHandId: null }); // later hands start automatically
    const hand = (await host.room(r => !!r.holdem && r.holdem.number > number && r.holdem.street !== 'complete', 3000)).holdem!;
    number = hand.number;
    await during();
    await finishHand(host, [b.peer, c.peer], hand.id);
    await host.room(r => r.holdem?.id === hand.id && r.holdem.street === 'complete');
    previous = hand.id;
  };
  await play(async () => { await rebuy(host, b.peer, b.id, 400); });                       // B in hand: held, then applied
  await play(async () => { host.send({ type: 'requestRebuy', amount: 250 }); await host.room(r => r.rebuyNotice?.amount === 250); }); // host: held
  await play(async () => { c.peer.send({ type: 'standUp' }); await host.room(r => player(r, c.id).standingUp === true); });
  await host.room(r => seatOf(r, c.id) === null);
  await rebuy(host, c.peer, c.id, 150);                                                     // spectator: immediate
  c.peer.send({ type: 'leave' }); await c.peer.next('left');                                // kept balance in the ledger
  const back = await app.connect('c:s1'); back.send({ type: 'join', code, nickname: 'C' }); await back.next('joined'); // restored once
  await play(async () => {});
  await sleep(50);
  const audits = of(logs, 'chip_audit', { phase: 'hand' });
  assert.ok(audits.length >= 4, `${audits.length} audits`);
  assert.ok(audits.every(a => a.ok === true), JSON.stringify(audits));
  assert.equal(audits[3].expected, 3000 + 400 + 250 + 150);
  // (Chip reset re-basing is covered in the first test; here the next hand starts automatically.)
});

test('chip audit reports a surplus (e.g. a grant applied twice) and a shortfall as errors', async t => {
  for (const [delta, kind] of [[500, 'excess'], [-300, 'missing']] as const) {
    const store = memoryStore();
    const first = await setup(t, { store });
    await table(first);
    await first.close();
    const saved = structuredClone(store.saved!);
    const r0 = saved.rooms[0];
    assert.equal(r0.chipExpected, 2000);
    r0.players[1].stack += delta; // tampered balance: chips created or lost outside the rules
    const { logs, sink } = capture();
    const second = await setup(t, { store: memoryStore(saved), seatEvents: sink });
    const a = await reconnect(second, 'a:s1'), b = await reconnect(second, 'b:s1');
    a.peer.send({ type: 'startHand', previousHandId: null });
    const hand = (await a.peer.room(r => !!r.holdem)).holdem!;
    await finishHand(a.peer, [b.peer], hand.id);
    await a.peer.room(r => r.holdem?.street === 'complete');
    const audit = of(logs, 'chip_audit', { phase: 'hand' })[0];
    assert.deepEqual({ ok: audit.ok, kind: audit.kind, delta: audit.delta, level: audit.level }, { ok: false, kind, delta, level: 'error' });
    await second.close();
  }
});

test('rate limit per room: excess info entries are counted and reported once; errors always pass; no sink costs nothing', () => {
  let now = 0;
  const out: Entry[] = [];
  const ev = createSeatEvents(e => out.push(e), 3, () => now);
  for (let i = 0; i < 5; i++) ev.emit('seat_hold', 'ROOMAAAA', { phase: 'started' });
  ev.emit('chip_audit', 'ROOMAAAA', { ok: false }, 'error');
  ev.emit('seat_hold', 'ROOMBBBB', { phase: 'started' });
  assert.equal(out.filter(e => (e.roomRef as string) === out[0].roomRef).length, 4, '3 info + 1 error');
  now = 61_000;
  ev.emit('seat_hold', 'ROOMAAAA', { phase: 'started' });
  assert.deepEqual(out.filter(e => e.event === 'seat_events_suppressed').map(e => e.dropped), [2]);
  const off = createSeatEvents();
  assert.equal(off.enabled, false);
  off.emit('seat_hold', 'ROOMAAAA', {}); // no sink: no-op
  assert.equal(serverConfig({}).seatEventLog, true);
  assert.equal(serverConfig({ SEAT_EVENT_LOG: '0' }).seatEventLog, false);
});

test('an older checkpoint without an audit baseline sets it at the first settled hand', async t => {
  const store = memoryStore();
  const first = await setup(t, { store });
  await table(first);
  await first.close();
  const saved = structuredClone(store.saved!);
  delete saved.rooms[0].chipExpected;
  const { logs, sink } = capture();
  const second = await setup(t, { store: memoryStore(saved), seatEvents: sink });
  const a = await reconnect(second, 'a:s1'), b = await reconnect(second, 'b:s1');
  a.peer.send({ type: 'startHand', previousHandId: null });
  const hand = (await a.peer.room(r => !!r.holdem)).holdem!;
  await finishHand(a.peer, [b.peer], hand.id);
  await a.peer.room(r => r.holdem?.street === 'complete');
  assert.deepEqual(of(logs, 'chip_audit').map(e => [e.phase, e.reason]), [['baseline', 'restored']]);
  void ({} as LobbyRoom);
});
