import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { TestContext } from 'node:test';
import { WebSocket } from 'ws';
import type { LobbyRoom, ServerMessage } from '@boardgame/shared';
import { createAppServer } from '../../src/http.ts';
import { attachLobby, type LobbyCheckpoint } from '../../src/lobby.ts';

// Shared WebSocket harness for seat / reconnect / rebuy tests (not a test file itself).
export type Joined = Extract<ServerMessage, { type: 'joined' }>;
export type RoomMessage = Extract<ServerMessage, { type: 'room' }>;
export type ErrorMessage = Extract<ServerMessage, { type: 'error' }>;

export class Peer {
  socket: WebSocket;
  queue: ServerMessage[] = [];
  token = '';
  private waiting: (() => void) | undefined;
  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on('message', data => { this.queue.push(JSON.parse(data.toString())); this.waiting?.(); });
  }
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
  /** Latest room snapshot received so far (without consuming the queue). */
  latest() { return ([...this.queue].reverse().find(m => m.type === 'room' || m.type === 'joined') as RoomMessage | Joined | undefined)?.room; }
}

export function memoryStore(initial: LobbyCheckpoint | null = null) {
  return { saved: initial, load() { return this.saved; }, save(value: LobbyCheckpoint) { this.saved = structuredClone(value); } };
}
/** "account:session" tokens. `slow` delays given tokens; `revoked` rejects them (single-session auth). */
export function stubAuth(control: { slow?: Map<string, number>; revoked?: Set<string> } = {}) {
  return async (token: string) => {
    const delay = control.slow?.get(token);
    if (delay) await new Promise(r => setTimeout(r, delay));
    if (control.revoked?.has(token)) return null;
    const [accountId, sessionId] = token.split(':');
    return accountId && sessionId ? { accountId, sessionId } : null;
  };
}

export async function setup(t: TestContext, options: Parameters<typeof attachLobby>[1] = {}) {
  const server = createAppServer();
  const lobby = attachLobby(server, { authorize: stubAuth(), runoutMs: 5, riverSqueezeMs: 10, nextHandMs: 60_000, turnMs: 10_000, seatRetentionMs: 10_000, offlineGraceMs: 20, diagnostic: () => {}, ...options });
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
export type App = Awaited<ReturnType<typeof setup>>;
export const player = (room: LobbyRoom, id: string) => (room.players.find(p => p.id === id) ?? {} as LobbyRoom['players'][number]);
export const seatOf = (room: LobbyRoom, id: string) => player(room, id)?.seat;
/** Member balances plus chips still in an unfinished pot. */
export const total = (room: LobbyRoom) => room.players.reduce((sum, p) => sum + (p.stack ?? 0), 0) + (room.holdem && room.holdem.street !== 'complete' ? room.holdem.pot : 0);

/** Host "A" (a:s1) creates and sits at 0; each guest joins and is approved into its seat. */
export async function table(app: App, guests: Array<[token: string, nickname: string, seat: number]> = [['b:s1', 'B', 1]]) {
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
  host.clear();
  for (const g of seated) g.peer.clear();
  return { host, hostId: created.playerId, code: created.room.code, guests: seated };
}
export async function reconnect(app: App, token: string) {
  const peer = await app.connect(token);
  peer.send({ type: 'currentRoom' });
  return { peer, joined: await peer.next('joined') as Joined };
}
/** Approve a rebuy for `peer` (host decides). Returns the room after the decision. */
export async function rebuy(host: Peer, peer: Peer, playerId: string, amount: number, approve = true) {
  peer.send({ type: 'requestRebuy', amount });
  const pending = await host.room(r => r.rebuyRequests?.some(q => q.playerId === playerId) ?? false);
  const request = pending.rebuyRequests!.find(q => q.playerId === playerId)!;
  host.send({ type: 'resolveRebuyRequest', requestId: request.id, approve });
  return { request, room: await peer.room(r => r.rebuyNotice?.requestId === request.id) };
}
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
