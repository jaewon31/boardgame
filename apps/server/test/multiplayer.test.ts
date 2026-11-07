import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { attachLobby, type ConnectionDiagnostic } from '../src/lobby.ts';
import { createAppServer } from '../src/http.ts';
import { accountAuthorizer } from '../src/accountSession.ts';
import { RoomClient, type RoomState, type ClientConnectionDiagnostic } from '../../mobile/src/services/RoomClient.ts';

const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';
const sessionA = '10000000-0000-4000-8000-000000000001';
const sessionB = '10000000-0000-4000-8000-000000000002';
const jwt = (id: string, session: string) => 'test.' + Buffer.from(JSON.stringify({sub:id, session_id:session, is_anonymous:true})).toString('base64url') + '.test-signature';
const tokenA = jwt(userA, sessionA), tokenB = jwt(userB, sessionB);
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Multiplayer condition timeout');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
async function setup(t: TestContext) {
  // Real authorizer and WebSockets; only the external Supabase HTTP boundary is mocked.
  const identities = new Map([[tokenA, userA], [tokenB, userB]]);
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const token = (init.headers as Record<string,string>).Authorization.slice(7);
    await new Promise(resolve => setTimeout(resolve, 2));
    return new Response(JSON.stringify(identities.get(token) ?? null));
  });
  const server = createAppServer();
  const logs: ConnectionDiagnostic[] = [];
  const lobby = attachLobby(server, {
    authorize: accountAuthorizer('https://test.supabase.co', 'sb_publishable_test'),
    heartbeatMs: 100, seatRetentionMs: 3000, nextHandMs: 10000,
    diagnostic: entry => logs.push(entry),
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const clients: RoomClient[] = [];
  const endpoint = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/lobby`;
  t.after(async () => {
    clients.forEach(client => client.dispose()); lobby.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  function client(token: string) {
    let state: RoomState | undefined;
    const history: RoomState[] = [];
    const diagnostics: ClientConnectionDiagnostic[] = [];
    const connection = new RoomClient(endpoint, next => { state = next; history.push(next); }, {
      heartbeatMs: 50, heartbeatTimeoutMs: 1000, retryMs: 10,
    }, undefined, entry => diagnostics.push(entry));
    connection.accessToken = async () => token;
    clients.push(connection);
    return {connection, history, diagnostics, get state() { return state; }};
  }
  return {client, lobby, logs, identities};
}

test('distinct anonymous UUIDs on one IP coexist, play, reconnect independently and leave', async t => {
  const app = await setup(t), a = app.client(tokenA), b = app.client(tokenB);
  await Promise.all([a.connection.restore(), b.connection.restore()]);
  await until(() => a.state?.status === 'idle' && b.state?.status === 'idle');
  a.connection.enter({type:'create', game:'holdem', nickname:'A'});
  await until(() => a.state?.status === 'connected');
  b.connection.enter({type:'join', code:a.state!.room!.code, nickname:'B'});
  await until(() => b.state?.status === 'connected' && a.state?.room?.players.length === 2);
  assert.notEqual(a.state!.playerId, b.state!.playerId);
  a.connection.startHand();
  await until(() => !!a.state?.room?.holdem && !!b.state?.room?.holdem);
  const seat = a.state!.playerId, hand = a.state!.room!.holdem!.id;
  const bHistory = b.history.length;
  // Close only A's actual transport; its normal retry path must preserve both seats.
  (a.connection as unknown as {socket: WebSocket}).socket.close();
  await until(() => a.history.some(s => s.status === 'reconnecting'));
  await until(() => a.state?.status === 'connected' && a.state.room?.players.every(p => p.connected) === true);
  assert.equal(a.state!.playerId, seat);
  assert.equal(a.state!.room!.holdem!.id, hand);
  assert.ok(b.history.slice(bHistory).every(s => s.status === 'connected'));
  assert.equal(app.lobby.stats().connections, 2);
  const current = a.state!.room!.holdem!;
  const actor = current.actorId === a.state!.playerId ? a : b;
  actor.connection.act('fold');
  await until(() => a.state?.room?.holdem?.street === 'complete' && b.state?.room?.holdem?.street === 'complete');
  b.connection.leave(); await until(() => b.state?.status === 'idle' && a.state?.room?.players.length === 1);
  assert.equal(a.state!.status, 'connected');
});

test('same account/session reproduces 4001 replacement but foreground must not take the seat back', async t => {
  const app = await setup(t), a = app.client(tokenA), copy = app.client(tokenA);
  a.connection.enter({type:'create', game:'holdem', nickname:'A'});
  await until(() => a.state?.status === 'connected');
  const seat = a.state!.playerId;
  await copy.connection.restore();
  await until(() => copy.state?.status === 'connected' && a.state?.status === 'error');
  assert.equal(copy.state!.playerId, seat);
  assert.match(a.state!.error!, /같은 자리/);
  assert.ok(a.diagnostics.some(e => e.event === 'client_close' && e.code === 4001));
  await until(() => app.logs.some(e => e.event === 'ws_cleanup' && e.ownsMembership === false));
  // useRoom's AppState callback uses automatic=true; explicit retry remains available.
  a.connection.refresh(true);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(a.state!.status, 'error');
  assert.equal(copy.state!.status, 'connected');
  a.connection.refresh();
  await until(() => a.state?.status === 'connected' && copy.state?.status === 'error');
  assert.equal(a.state!.playerId, seat);
});

test('simultaneous independent creates never share a room or overwrite membership', async t => {
  const app = await setup(t), a = app.client(tokenA), b = app.client(tokenB);
  a.connection.enter({type:'create', game:'holdem', nickname:'A'});
  b.connection.enter({type:'create', game:'holdem', nickname:'B'});
  await until(() => a.state?.status === 'connected' && b.state?.status === 'connected');
  assert.notEqual(a.state!.room!.code, b.state!.room!.code);
  assert.equal(app.lobby.stats().rooms, 2);
  a.connection.dispose();
  const returning = app.client(tokenA); await returning.connection.restore();
  await until(() => returning.state?.status === 'connected');
  assert.equal(returning.state!.playerId, a.state!.playerId);
  assert.equal(b.state!.status, 'connected');
  assert.equal(returning.state!.room!.players.length, 1);
});

test('new login replaces only its own account with 4003; automatic foreground stays stopped', async t => {
  const app = await setup(t), a = app.client(tokenA), b = app.client(tokenB);
  a.connection.enter({type:'create', game:'holdem', nickname:'A'});
  b.connection.enter({type:'create', game:'holdem', nickname:'B'});
  await until(() => a.state?.status === 'connected' && b.state?.status === 'connected');
  const fresh = jwt(userA, '20000000-0000-4000-8000-000000000001');
  app.identities.delete(tokenA); app.identities.set(fresh, userA);
  const replacement = app.client(fresh); await replacement.connection.restore();
  await until(() => a.state?.status === 'error' && replacement.state?.status === 'idle');
  assert.ok(app.logs.some(e => e.event === 'ws_replaced' && e.code === 4003));
  const attempts = a.diagnostics.filter(e => e.event === 'client_connect').length;
  a.connection.refresh(true);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(a.diagnostics.filter(e => e.event === 'client_connect').length, attempts);
  assert.equal(b.state!.status, 'connected');
});

test('diagnostics correlate identities and redact tokens, raw UUIDs and arbitrary close reasons', async t => {
  const app = await setup(t), a = app.client(tokenA), b = app.client(tokenB);
  a.connection.enter({type:'create', game:'holdem', nickname:'PRIVATE_NAME'});
  b.connection.enter({type:'create', game:'holdem', nickname:'OTHER_NAME'});
  await until(() => a.state?.status === 'connected' && b.state?.status === 'connected');
  const verified = app.logs.filter(e => e.event === 'ws_authenticated');
  assert.equal(new Set(verified.map(e => e.accountRef)).size, 2);
  assert.ok(verified.every(e => /^[a-f0-9]{16}$/.test(e.accountRef!)));
  assert.ok(app.logs.some(e => e.connectionsForIp === 2));
  const rawReason = 'Bearer PRIVATE_CLOSE_TOKEN';
  (a.connection as unknown as {socket: WebSocket}).socket.close(4001, rawReason);
  await until(() => a.state?.status === 'error' && app.logs.some(e => e.event === 'ws_close' && e.code === 4001));
  assert.ok(app.logs.some(e => e.event === 'ws_close' && e.reason === 'redacted'));
  assert.ok(a.diagnostics.some(e => e.event === 'client_close' && e.reason === 'redacted'));
  const output = JSON.stringify([app.logs, a.diagnostics, b.diagnostics]);
  for (const secret of [tokenA, tokenB, userA, userB, sessionA, sessionB, rawReason, 'PRIVATE_NAME', 'OTHER_NAME']) {
    assert.ok(!output.includes(secret), 'Sensitive diagnostic data leaked');
  }
});

test('stale close callback after reconnect cannot revoke the new socket or schedule a retry', async t => {
  const app = await setup(t), a = app.client(tokenA);
  a.connection.enter({type:'create', game:'holdem', nickname:'A'});
  await until(() => a.state?.status === 'connected');
  const old = (a.connection as unknown as {socket: WebSocket}).socket;
  const callback = old.onclose!;
  old.close();
  await until(() => a.history.some(s => s.status === 'reconnecting'));
  await until(() => a.state?.status === 'connected');
  const attempts = a.diagnostics.filter(e => e.event === 'client_connect').length;
  callback.call(old, {code:4001, reason:'Session replaced', wasClean:true} as CloseEvent);
  a.connection.refresh(true);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(a.state!.status, 'connected');
  assert.equal(a.diagnostics.filter(e => e.event === 'client_connect').length, attempts);
  assert.ok(a.diagnostics.some(e => e.event === 'client_close' && e.code === 4001 && e.stale));
});
