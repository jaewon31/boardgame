import { soundCatalog, type GameSound, type SoundCue } from './soundCatalog.ts';

export interface SoundPlayer {
  readonly isLoaded: boolean;
  readonly currentStatus?: { isLoaded: boolean };
  volume: number;
  shouldCorrectPitch?: boolean;
  setPlaybackRate?(rate: number, quality?: 'high'): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  play(): void;
}
export interface AudioPort {
  player(sound: GameSound): SoundPlayer;
  onEnd(sound: GameSound, done: () => void, failed?: () => void): () => void;
  trace?(event: string, sound: GameSound): void;
  /** Opt-in timing diagnostics (gameTiming). Must not throw into playback; failures are ignored. */
  timing?(event: string, detail: Record<string, string | number | boolean | undefined>): void;
  gain(sound: GameSound): number;
  error(): void;
}
type Lane = 'action' | 'board' | 'result' | 'notice';
const LANES: readonly Lane[] = ['action', 'board', 'result', 'notice'];
/** Lanes where a newer event replaces an older one instead of queueing behind it. */
const LATEST_WINS: ReadonlySet<Lane> = new Set(['action', 'board']);
/** A result cue lets a running action sound finish for at most this long, then interrupts it. */
export const RESULT_YIELD_MS = 400;
export interface ScheduledCue extends SoundCue {
  /** Diagnostics only: revision of the state that produced this cue (set when timing is observed). */
  sourceRevision?: number;
  /** Monotonic end of the server-owned between-hand window. */
  endAt?: number;
}
interface Queued extends ScheduledCue { at: number }
interface Run { cue: Queued; started: number; playing: boolean; ended?: boolean; remove?: () => void; outcome?: string }

// Sound only: card visuals never wait for this scheduler (see CardPresentation).
// - action/board: latest-wins. A new action (or street) stops the older one and replaces anything
//   still waiting, so sounds never pile up behind the game state; a cue that cannot start within
//   its short maxWaitMs (unloaded voice, slow seek) is skipped as stale.
// - result: pot → victory → shuffle in event order. It yields briefly to the final action sound.
// - notice: my-turn/warning, independent of the table.
export class AudioScheduler {
  private enabled = false;
  private queue: Queued[] = [];
  private seen = new Set<string>();
  private running = new Map<Lane, Run>();
  private seeking = new Set<GameSound>();
  private port: AudioPort;
  private clock: () => number;
  constructor(port: AudioPort, clock: () => number = () => performance.now()) { this.port = port; this.clock = clock; }
  setEnabled(enabled: boolean) {
    if (!enabled) this.cancel();
    this.enabled = enabled;
  }
  private lane(sound: GameSound): Lane { return soundCatalog[sound].lane; }
  private maxWait(sound: GameSound) {
    const profile = soundCatalog[sound];
    return 'maxWaitMs' in profile ? profile.maxWaitMs : 1500;
  }
  private ready(sound: GameSound) {
    const player = this.port.player(sound);
    // Expo Audio 58 Android's direct getter is false in STATE_ENDED;
    // currentStatus.isLoaded explicitly includes ended, so seekTo(0) can replay it.
    return player.currentStatus?.isLoaded ?? player.isLoaded;
  }
  private trace(event: string, sound: GameSound) {
    try { this.port.trace?.(event, sound); } catch { /* Diagnostics cannot affect sound. */ }
  }
  private timing(event: string, cue: Queued, detail: Record<string, string | number | boolean | undefined> = {}) {
    if (!this.port.timing) return;
    // Cue ids are `${handId}:${revisionOrKey}:${sound}`; log only the short hand ref and key.
    const [hand, key] = cue.id.split(':');
    try { this.port.timing(event, { sound: cue.sound, handRef: hand?.slice(0, 8), cueKey: key, revision: cue.sourceRevision, lane: this.lane(cue.sound), ...detail }); } catch { /* Diagnostics cannot affect sound. */ }
  }
  preview(cue: SoundCue) {
    // Explicit audition is latest-selection-wins.
    this.cancel();
    this.enqueue([cue]);
  }
  enqueue(cues: ScheduledCue[]) {
    for (const cue of cues) {
      if (this.seen.has(cue.id)) continue;
      this.seen.add(cue.id);
      if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
      if (!this.enabled || this.port.gain(cue.sound) <= 0) continue;
      const queued = { ...cue, at: this.clock() }, lane = this.lane(cue.sound);
      if (LATEST_WINS.has(lane)) {
        this.queue = this.queue.filter(old => {
          if (this.lane(old.sound) !== lane) return true;
          this.timing('client_audio_dropped', old, { reason: 'superseded', waitedMs: Math.round(queued.at - old.at) });
          return false;
        });
        const current = this.running.get(lane);
        if (current) { current.outcome = 'superseded'; this.finish(lane, current, true); }
      }
      this.queue.push(queued);
      this.timing('client_audio_queued', queued, { queueDepth: this.queue.length });
    }
    this.queue = this.queue.slice(-32);
    this.tick();
  }
  tick() {
    const now = this.clock();
    this.queue = this.queue.filter(cue => {
      const keep = (cue.endAt === undefined || now < cue.endAt) && now - cue.at <= this.maxWait(cue.sound)
        && this.enabled && this.port.gain(cue.sound) > 0;
      if (!keep) this.timing('client_audio_dropped', cue, { reason: 'stale', waitedMs: Math.round(now - cue.at) });
      return keep;
    });
    for (const lane of LANES) {
      const current = this.running.get(lane);
      if (current?.cue.endAt !== undefined) {
        if (now >= current.cue.endAt) { current.outcome = 'window_end'; this.finish(lane, current, true); continue; }
        this.port.player(current.cue.sound).volume = this.volume(current, now);
      }
      if (current?.ended) this.finish(lane, current, false);
      // A broken native completion callback must not block the lane indefinitely.
      if (current && this.running.get(lane) === current && now - current.started > ('maxPlayMs' in soundCatalog[current.cue.sound] ? (soundCatalog[current.cue.sound] as { maxPlayMs: number }).maxPlayMs : 5000)) { current.outcome = 'max_play_timeout'; this.finish(lane, current, true); this.port.error(); }
      if (this.running.has(lane)) continue;
      const index = this.queue.findIndex(cue => this.lane(cue.sound) === lane && !this.seeking.has(cue.sound) && this.ready(cue.sound));
      if (index < 0) continue;
      const cue = this.queue[index];
      if (lane === 'result') {
        // Event order: the action that ended the hand is heard first, but only briefly.
        const action = this.running.get('action');
        if (action && now - cue.at < RESULT_YIELD_MS) continue;
        if (action) { action.outcome = 'interrupted'; this.finish('action', action, true); }
      }
      // An unavailable voice must not block ready effects behind it.
      this.queue.splice(index, 1);
      const run: Run = { cue, started: now, playing: false };
      this.running.set(lane, run);
      void this.start(lane, run);
    }
  }
  private async start(lane: Lane, run: Run) {
    const sound = run.cue.sound, player = this.port.player(sound);
    this.seeking.add(sound);
    try {
      player.pause();
      await player.seekTo(run.cue.endAt === undefined ? 0 : Math.max(0, (this.clock() - (run.cue.endAt - 5000)) / 1000));
      if (!this.enabled || this.running.get(lane) !== run) return;
      const gain = this.port.gain(sound);
      run.started = this.clock();
      player.volume = this.volume(run, run.started);
      if (player.setPlaybackRate) {
        player.shouldCorrectPitch = true;
        player.setPlaybackRate(sound === 'deal' ? 1.5 : 1, 'high');
      }
      if (run.cue.endAt !== undefined && this.clock() >= run.cue.endAt) { run.outcome = 'window_end'; this.finish(lane, run, true); return; }
      // Android applies the native volume setter asynchronously; do not read it back.
      // A slow seek must never start a sound that no longer matches the table.
      if (gain <= 0 || this.clock() - run.cue.at > this.maxWait(sound)) { run.outcome = 'expired'; this.finish(lane, run, false); return; }
      run.remove = this.port.onEnd(sound, () => {
        if (!run.playing || this.running.get(lane) !== run) return;
        run.ended = true;
        this.finish(lane, run, false);
      }, () => {
        if (this.running.get(lane) !== run) return;
        this.trace('error', sound); run.outcome = 'error'; this.finish(lane, run, true); this.port.error();
      });
      run.playing = true;
      player.play();
      this.timing('client_audio_started', run.cue, { mode: 'sound', queueWaitMs: Math.round(run.started - run.cue.at) });
      this.trace('play_requested', sound);
    } catch {
      if (this.running.get(lane) === run) { run.outcome = 'play_failed'; this.finish(lane, run, true); this.port.error(); }
    } finally { this.seeking.delete(sound); }
  }
  private finish(lane: Lane, run: Run, pause: boolean) {
    if (this.running.get(lane) !== run) return;
    this.trace(pause ? 'cancelled' : 'finished', run.cue.sound);
    if (this.port.timing) {
      const now = this.clock();
      this.timing('client_audio_finished', run.cue, { outcome: run.outcome ?? (pause ? 'cancelled' : 'finished'),
        playMs: Math.round(now - run.started), totalMs: Math.round(now - run.cue.at) });
    }
    this.running.delete(lane);
    run.remove?.();
    if (pause) {
      // Native hook disposal can precede this hook's cleanup.
      try { this.port.player(run.cue.sound).pause(); } catch { /* Already released. */ }
    }
  }
  private volume(run: Run, now: number) {
    const envelope = run.cue.endAt === undefined ? 1 : Math.max(0, Math.min(1, (now - run.started) / 60, (run.cue.endAt - now) / 180));
    return this.port.gain(run.cue.sound) * envelope;
  }
  refreshVolumes() {
    for (const run of this.running.values()) this.port.player(run.cue.sound).volume = this.volume(run, this.clock());
  }
  cancel() {
    this.queue = [];
    for (const [lane, run] of this.running) this.finish(lane, run, true);
    // Outstanding seeks retain their lock until settled, even after re-enable.
  }
}
