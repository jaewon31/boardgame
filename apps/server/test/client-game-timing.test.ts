import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HoldemView } from '@boardgame/shared';
import { GameTimingLog, gameTiming, type ClientTimingEntry } from '../../mobile/src/services/gameTiming.ts';
import { SoundEvents } from '../../mobile/src/services/soundEvents.ts';
import { CardPresentation } from '../../mobile/src/services/cardPresentation.ts';
import { AudioScheduler } from '../../mobile/src/services/audioScheduler.ts';
import { soundCatalog } from '../../mobile/src/services/soundCatalog.ts';
import { RoomClient } from '../../mobile/src/services/RoomClient.ts';

const HAND_ID = '0f1e2d3c-PRIVATE-HAND-ID';
const base = { id: HAND_ID, number: 1, revision: 0, street: 'preflop', board: [], players: [{ id: 'p', nickname: 'PRIVATE_NAME', cards: ['14s', '13h'] }],
  payouts: [], actorId: 'b', legal: null } as unknown as HoldemView;
const flop = { ...base, revision: 1, street: 'flop', board: ['2s', '3s', '4s'], audioAction: { revision: 1, kind: 'check' } } as unknown as HoldemView;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const cardPattern = /^(?:[2-9]|1[0-4])[shdc]$/;
function assertSafe(entries: ClientTimingEntry[]) {
  const json = JSON.stringify(entries);
  assert.ok(!json.includes('PRIVATE'), 'no hand id beyond the short ref, nicknames or tokens');
  for (const e of entries) for (const v of Object.values(e)) if (typeof v === 'string') assert.ok(!cardPattern.test(v), `card-like value in ${e.event}`);
}

test('client timing is disabled by default and records nothing', () => {
  assert.equal(gameTiming.enabled, false);
  const log = new GameTimingLog();
  let calls = 0; log.configure({ enabled: false, sink: () => { calls++; } });
  log.record('x'); log.roomReceived('room', flop, 0, 10, 0);
  assert.equal(calls, 0); assert.deepEqual(log.dump(), []);
});

test('room receipt, new street, card reveal and audio share handRef/revision and monotonic receipt deltas', async () => {
  let now = 100; const entries: ClientTimingEntry[] = [];
  const log = new GameTimingLog(); log.configure({ enabled: true, sink: e => entries.push(e), clock: () => now });
  log.roomReceived('joined', base, now, 900, 0.4);
  now = 1000; log.roomReceived('room', flop, now, 1200, 0.6);
  assert.deepEqual(entries.map(e => e.event), ['client_room_received', 'client_room_received', 'client_new_street']);
  const street = entries[2];
  assert.equal(street.handRef, HAND_ID.slice(0, 8)); assert.equal(street.fromStreet, 'preflop'); assert.equal(street.toStreet, 'flop'); assert.equal(street.toBoard, 3);
  // Card reveals and audio are wired the same way useGameAudio wires them.
  const ends = new Map<string, () => void>();
  const players = Object.fromEntries(Object.keys(soundCatalog).map(sound => [sound, { isLoaded: true, volume: 0, pause() {}, seekTo: async () => {}, play() {} }]));
  const scheduler = new AudioScheduler({ player: s => players[s] as never, gain: () => 1, error() {}, onEnd(s, done) { ends.set(s, done); return () => ends.delete(s); },
    timing: (event, detail) => log.record(event, { ...detail, sinceReceiptMs: log.sinceReceipt(detail.handRef as string, Number(detail.cueKey)) }) }, () => now);
  scheduler.setEnabled(true);
  const visuals = new CardPresentation(() => {}, () => now, (event, d) => log.record(event, { handRef: d.handId?.slice(0, 8), revision: d.revision, kind: d.kind, index: d.index,
    animated: d.animated, sinceReceiptMs: log.sinceReceipt(d.handId?.slice(0, 8), d.revision) }));
  const events = new SoundEvents(); visuals.restore(base); events.update(base, 'a', true, 0);
  now = 1010; scheduler.enqueue(visuals.prepare(flop, events.update(flop, 'a', true, now))); await flush();
  now = 1730; ends.get('check')!(); scheduler.tick(); await flush();
  const reveal = entries.find(e => e.event === 'client_card_reveal')!;
  assert.equal(reveal.kind, 'board'); assert.equal(reveal.index, 0); assert.equal(reveal.animated, true);
  assert.equal(reveal.revision, 1); assert.equal(reveal.sinceReceiptMs, 730, 'receipt → first flop card on this device');
  const check = entries.find(e => e.event === 'client_audio_started' && e.sound === 'check')!;
  assert.equal(check.mode, 'sound'); assert.equal(check.cueKey, '1'); assert.equal(check.sinceReceiptMs, 10);
  const checkDone = entries.find(e => e.event === 'client_audio_finished' && e.sound === 'check')!;
  assert.equal(checkDone.outcome, 'finished'); assert.equal(checkDone.playMs, 720);
  assert.ok(entries.some(e => e.event === 'client_audio_queued' && e.sound === 'flopReveal'));
  // A completion callback that never arrives is bounded and reported, not silent.
  now += 5001; scheduler.tick(); await flush();
  assert.ok(entries.some(e => e.event === 'client_audio_finished' && e.outcome === 'max_play_timeout'));
  for (let i = 1; i < entries.length; i++) assert.ok(entries[i].monoMs >= entries[i - 1].monoMs);
  assertSafe(entries);
});

test('timing observers that throw never change card presentation or playback', async () => {
  let now = 0;
  const throwing = () => { throw new Error('observer failure'); };
  const players = Object.fromEntries(Object.keys(soundCatalog).map(sound => [sound, { isLoaded: true, volume: 0, pause() {}, seekTo: async () => {}, play() {} }]));
  const ends = new Map<string, () => void>();
  const scheduler = new AudioScheduler({ player: s => players[s] as never, gain: () => 1, error() {}, onEnd(s, done) { ends.set(s, done); return () => ends.delete(s); }, timing: throwing }, () => now);
  scheduler.setEnabled(true);
  const visuals = new CardPresentation(() => {}, () => now, throwing), events = new SoundEvents();
  visuals.restore(base); events.update(base, 'a', true, 0);
  scheduler.enqueue(visuals.prepare(flop, events.update(flop, 'a', true, now))); await flush();
  now = 720; ends.get('check')!(); scheduler.tick(); await flush();
  assert.equal(visuals.state.boardCount, 1);
});

test('RoomClient reports room receipt for joined and room messages only when enabled', t => {
  const entries: ClientTimingEntry[] = [];
  gameTiming.configure({ enabled: true, sink: e => entries.push(e) });
  t.after(() => gameTiming.configure({ enabled: false }));
  let socket: any; const original = globalThis.WebSocket;
  globalThis.WebSocket = class { static OPEN = 1; readyState = 1; onopen?: () => void; onmessage?: (e: any) => void; sent: any[] = [];
    constructor() { socket = this; } send(raw: string) { this.sent.push(JSON.parse(raw)); } close() { this.readyState = 3; } } as any;
  const client = new RoomClient('ws://localhost/lobby', () => {}, {}, undefined, () => {});
  t.after(() => { client.dispose(); globalThis.WebSocket = original; });
  client.enter({ type: 'create', nickname: 'PRIVATE_NAME', game: 'holdem' }); socket.onopen();
  socket.onmessage({ data: JSON.stringify({ type: 'joined', room: { code: 'PRIVATEC', holdem: base }, playerId: 'PRIVATE_UUID', token: 'PRIVATE_TOKEN' }) });
  socket.onmessage({ data: JSON.stringify({ type: 'room', room: { code: 'PRIVATEC', holdem: flop } }) });
  const received = entries.filter(e => e.event === 'client_room_received');
  assert.deepEqual(received.map(e => [e.kind, e.revision, e.street, e.boardCount]), [['joined', 0, 'preflop', 0], ['room', 1, 'flop', 3]]);
  assert.ok(entries.some(e => e.event === 'client_new_street' && e.toStreet === 'flop'));
  assert.ok(Number(received[1].bytes) > 0); assert.ok(Number(received[1].parseMs) >= 0);
  assertSafe(entries);
});
