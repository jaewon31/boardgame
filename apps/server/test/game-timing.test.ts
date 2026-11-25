import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { WebSocket } from 'ws';
import type { Card, HoldemView, ServerMessage } from '@boardgame/shared';
import { shuffledDeck } from '../src/holdem/cards.ts';
import { createAppServer } from '../src/http.ts';
import { attachLobby } from '../src/lobby.ts';
import { serverConfig } from '../src/config.ts';
import type { GameTimingEntry } from '../src/gameTiming.ts';

type RoomMessage = Extract<ServerMessage, { type: 'room' }>;
type Joined = Extract<ServerMessage, { type: 'joined' }>;
const cardPattern = /^(?:[2-9]|1[0-4])[shdc]$/;

class Peer {
  socket: WebSocket; token: string; private queue: ServerMessage[] = []; private waiting?: () => void;
  constructor(url: string, token: string) {
    this.token = token;
    this.socket = new WebSocket(url);
    this.socket.on('message', data => { this.queue.push(JSON.parse(data.toString())); this.waiting?.(); });
  }
  send(value: Record<string, unknown>) { this.socket.send(JSON.stringify({ ...value, accessToken: this.token })); }
  sendAs(token: string, value: Record<string, unknown>) { this.socket.send(JSON.stringify({ ...value, accessToken: token })); }
  next(type: ServerMessage['type'], predicate: (m: ServerMessage) => boolean = () => true): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting = undefined; reject(new Error(`Timed out waiting for ${type}`)); }, 3000);
      const check = () => { const i = this.queue.findIndex(m => m.type === type && predicate(m)); if (i >= 0) { clearTimeout(timer); this.waiting = undefined; resolve(this.queue.splice(i, 1)[0]); } };
      this.waiting = check; check();
    });
  }
}
async function setup(t: TestContext, gameTiming?: (e: GameTimingEntry) => void, turnMs?: number, deck?: Card[]) {
  const server = createAppServer();
  const lobby = attachLobby(server, { runoutMs: 20, riverSqueezeMs: 20, nextHandMs: 60_000, gameTiming, turnMs, autoSeat: true, deck: deck ? () => deck : undefined,
    authorize: async token => token.startsWith('PRIVATE_TOKEN_') ? { accountId: `PRIVATE_ACCOUNT_${token}`, sessionId: `PRIVATE_SESSION_${token}` } : null });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/lobby`;
  const peers: Peer[] = [];
  t.after(async () => { for (const p of peers) p.socket.terminate(); lobby.close(); await new Promise<void>(r => server.close(() => r())); });
  return { async connect(token: string) { const p = new Peer(url, token); peers.push(p); await once(p.socket, 'open'); return p; } };
}
/** Plays one heads-up hand by calling/checking preflop, then going all-in on the flop. */
async function script(t: TestContext, gameTiming?: (e: GameTimingEntry) => void, deck?: Card[]) {
  const app = await setup(t, gameTiming, undefined, deck);
  const a = await app.connect('PRIVATE_TOKEN_A'), b = await app.connect('PRIVATE_TOKEN_B');
  a.send({ type: 'create', nickname: 'PRIVATE_A', game: 'holdem' });
  const created = await a.next('joined') as Joined;
  b.send({ type: 'join', code: created.room.code, nickname: 'PRIVATE_B' });
  const joinedB = await b.next('joined') as Joined;
  const peerOf = (id: string | null) => id === created.playerId ? a : b;
  const states: Array<Pick<HoldemView, 'street' | 'revision'> & { board: number }> = [];
  const view = async (predicate: (v: HoldemView) => boolean) => {
    const v = (await b.next('room', m => m.type === 'room' && !!m.room.holdem && predicate(m.room.holdem)) as RoomMessage).room.holdem!;
    states.push({ street: v.street, revision: v.revision, board: v.board.length }); return v;
  };
  a.send({ type: 'startHand', previousHandId: null });
  let v = await view(h => h.revision === 0);
  peerOf(v.actorId).send({ type: 'act', handId: v.id, revision: v.revision, action: 'call' });
  v = await view(h => h.revision === 1);
  peerOf(v.actorId).send({ type: 'act', handId: v.id, revision: v.revision, action: 'check' });
  v = await view(h => h.street === 'flop');
  peerOf(v.actorId).send({ type: 'act', handId: v.id, revision: v.revision, action: 'allIn' });
  v = await view(h => h.revision === 3);
  peerOf(v.actorId).send({ type: 'act', handId: v.id, revision: v.revision, action: 'call' });
  // Runout: turn and river are dealt by server timers; a squeeze may need the trailing player.
  for (;;) {
    v = await view(h => h.revision > v.revision);
    if (v.street === 'complete') break;
    if (v.runout?.phase === 'squeezing' && v.runout.playerId) peerOf(v.runout.playerId).send({ type: 'revealRiver', handId: v.id });
  }
  return { states, handId: v.id, joinedB, code: created.room.code };
}

test('game timing is off by default and GAME_TIMING_LOG=1 is the only switch', () => {
  assert.equal(serverConfig({}).gameTimingLog, false);
  assert.equal(serverConfig({ GAME_TIMING_LOG: 'true' }).gameTimingLog, false);
  assert.equal(serverConfig({ GAME_TIMING_LOG: '1' }).gameTimingLog, true);
});

test('timing logs follow one action through auth, apply, street change and broadcast without secrets', async t => {
  const entries: GameTimingEntry[] = [];
  const { handId } = await script(t, e => entries.push(e));
  const ref = handId.slice(0, 8);
  // Order for the action that closes preflop (check → flop).
  const applied = entries.find(e => e.event === 'game_action_applied' && e.streetBefore === 'preflop' && e.streetAfter === 'flop')!;
  assert.ok(applied, 'street-closing action is logged');
  const trace = applied.trace;
  const flow = entries.filter(e => e.trace === trace).map(e => e.event);
  assert.deepEqual(flow, ['game_request_received', 'game_auth_started', 'game_auth_finished', 'game_action_applied', 'game_street_changed', 'game_state_broadcast', 'game_request_done']);
  const changed = entries.find(e => e.trace === trace && e.event === 'game_street_changed')!;
  assert.equal(changed.fromStreet, 'preflop'); assert.equal(changed.toStreet, 'flop'); assert.equal(changed.toBoard, 3); assert.equal(changed.handRef, ref);
  const sent = entries.find(e => e.trace === trace && e.event === 'game_state_broadcast')!;
  assert.equal(sent.recipients, 2); assert.equal(sent.street, 'flop'); assert.equal(sent.cause, 'action');
  for (const key of ['queueWaitMs', 'authMs', 'handleMs', 'totalMs'] as const) assert.ok(Number(entries.find(e => e.trace === trace && e.event === 'game_request_done')![key]) >= 0, key);
  assert.equal(entries.find(e => e.trace === trace && e.event === 'game_auth_finished')!.outcome, 'verified');
  // Intentional waits: runout timers are scheduled with their configured delay and fire into street changes.
  const runoutTimer = entries.find(e => e.event === 'game_timer_fired' && e.kind === 'runout')!;
  assert.ok(runoutTimer, 'runout timer fired');
  // delayMs is the remaining time to the server deadline (configured runoutMs = 20).
  assert.ok(Number(runoutTimer.delayMs) > 0 && Number(runoutTimer.delayMs) <= 20); assert.ok(Number(runoutTimer.lateMs) > -5);
  assert.ok(entries.some(e => e.event === 'game_timer_scheduled' && e.kind === 'runout' && Number(e.delayMs) <= 20));
  assert.ok(entries.some(e => e.event === 'game_street_changed' && e.trace === runoutTimer.trace && e.cause === 'runout'));
  assert.ok(entries.some(e => e.event === 'game_street_changed' && e.toStreet === 'complete'));
  // Ping traffic is measured as well.
  // Monotonic ordering and safety.
  for (let i = 1; i < entries.length; i++) assert.ok(entries[i].monoMs >= entries[i - 1].monoMs);
  const json = JSON.stringify(entries);
  assert.ok(!json.includes('PRIVATE_'), 'no tokens, accounts or nicknames');
  assert.ok(!json.includes(handId), 'only the short hand ref');
  for (const e of entries) for (const value of Object.values(e)) if (typeof value === 'string') assert.ok(!cardPattern.test(value), `card-like value in ${e.event}`);
});

test('enabling timing does not change the messages players receive', async t => {
  // Compare the same deal with timing off and on. Two independent random deals differ ~3% of the
  // time (a tied turn skips the river squeeze), which is not a timing effect.
  const deck = shuffledDeck();
  const plain = await script(t, undefined, deck);
  const timed = await script(t, () => {}, deck);
  assert.deepEqual(timed.states, plain.states);
});

test('a throwing timing sink never breaks game progression', async t => {
  const { states } = await script(t, () => { throw new Error('sink failure'); });
  assert.equal(states.at(-1)?.street, 'complete');
});

/** Disconnect path: B drops right after the deal; turn timers finish the hand. Observed from A. */
async function disconnectScript(t: TestContext, gameTiming?: (e: GameTimingEntry) => void) {
  const app = await setup(t, gameTiming, 25);
  const a = await app.connect('PRIVATE_TOKEN_A'), b = await app.connect('PRIVATE_TOKEN_B');
  a.send({ type: 'create', nickname: 'PRIVATE_A', game: 'holdem' });
  const created = await a.next('joined') as Joined;
  b.send({ type: 'join', code: created.room.code, nickname: 'PRIVATE_B' }); await b.next('joined');
  a.send({ type: 'startHand', previousHandId: null });
  await a.next('room', m => m.type === 'room' && !!m.room.holdem);
  b.socket.terminate();
  const states: string[] = [];
  for (;;) {
    const m = await a.next('room') as RoomMessage;
    const h = m.room.holdem;
    states.push(`${h?.street}:${h?.revision}:${h?.board.length}:${m.room.players.map(p => p.connected).join(',')}`);
    if (h?.street === 'complete') break;
  }
  return states;
}

test('roomRef is a per-process HMAC, not a reversible hash of the invite code', async t => {
  const entries: GameTimingEntry[] = [];
  const { code } = await script(t, e => entries.push(e));
  const refs = new Set(entries.map(e => e.roomRef).filter(Boolean));
  assert.equal(refs.size, 1);
  const [ref] = refs;
  assert.match(String(ref), /^[0-9a-f]{16}$/);
  assert.notEqual(ref, createHash('sha256').update(code).digest('hex').slice(0, 16));
  const json = JSON.stringify(entries);
  assert.ok(!json.includes(code), 'room code never logged');
});

test('timer lifecycle: every scheduled timer ends fired, cancelled (with reason) or still pending', async t => {
  const entries: GameTimingEntry[] = [];
  await script(t, e => entries.push(e));
  const scheduled = entries.filter(e => e.event === 'game_timer_scheduled').map(e => e.trace);
  const fired = new Set(entries.filter(e => e.event === 'game_timer_fired').map(e => e.trace));
  const cancelled = entries.filter(e => e.event === 'game_timer_cancelled');
  for (const c of cancelled) {
    assert.ok(['resync', 'replaced', 'cancelled', 'room_closed', 'shutdown'].includes(String(c.reason)), String(c.reason));
    assert.ok(!fired.has(c.trace), 'a timer cannot be both fired and cancelled');
    assert.ok(Number(c.afterMs) >= 0);
  }
  assert.ok(cancelled.some(c => c.reason === 'resync' && c.kind === 'turn'), 'acted-on turn timers are reported as cancelled');
  const ended = new Set([...fired, ...cancelled.map(c => c.trace)]);
  const open = scheduled.filter(trace => !ended.has(trace));
  assert.ok(open.length <= 2, `at most one pending timer per slot, got ${open.length}`);
});

test('early exits close their trace: auth rejection and ping without membership', async t => {
  const entries: GameTimingEntry[] = [];
  const app = await setup(t, e => entries.push(e));
  const a = await app.connect('PRIVATE_TOKEN_A'), stranger = await app.connect('PRIVATE_TOKEN_S');
  stranger.send({ type: 'ping', id: 1 }); await stranger.next('error');
  a.send({ type: 'create', nickname: 'PRIVATE_A', game: 'holdem' }); await a.next('joined');
  a.sendAs('PRIVATE_TOKEN_OTHER', { type: 'ping', id: 2 }); await a.next('error');
  const done = entries.filter(e => e.event === 'game_request_done').map(e => e.outcome);
  assert.ok(done.includes('no_membership'), String(done));
  assert.ok(done.includes('auth_rejected'), String(done));
  for (const e of entries.filter(e => e.event === 'game_auth_started')) {
    assert.ok(entries.some(d => d.event === 'game_request_done' && d.trace === e.trace), `trace ${e.trace} has an end`);
  }
  assert.ok(!JSON.stringify(entries).includes('PRIVATE_'));
});

test('enabling timing does not change the disconnect/turn-timeout path', async t => {
  const plain = await disconnectScript(t);
  const timed = await disconnectScript(t, () => {});
  assert.deepEqual(timed, plain);
  assert.equal(plain.at(-1)?.startsWith('complete'), true);
});
