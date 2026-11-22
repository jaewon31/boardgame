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
type Lane = 'table' | 'notice';
export interface ScheduledCue extends SoundCue {
  minDurationMs?: number;
  /** Monotonic end of the server-owned between-hand window. */
  endAt?: number;
  onStart?: () => void;
  onCancel?: () => void;
}
interface Queued extends ScheduledCue { at: number }
interface Run { cue: Queued; started: number; playing: boolean; ended?: boolean; visualStarted?: boolean; silent?: boolean; remove?: () => void; outcome?: string }

// Two independent lanes; running cues are never preempted by later cues.
// Table cues stay in authoritative order: an action precedes its resulting card reveals.
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
    try { this.port.timing(event, { sound: cue.sound, handRef: hand?.slice(0, 8), cueKey: key, visual: !!cue.onStart, ...detail }); } catch { /* Diagnostics cannot affect sound. */ }
  }
  preview(cue: SoundCue) {
    // Explicit audition is latest-selection-wins, unlike the non-preemptive game queue.
    this.cancel();
    this.enqueue([cue]);
  }
  enqueue(cues: ScheduledCue[]) {
    for (const cue of cues) {
      if (this.seen.has(cue.id)) continue;
      this.seen.add(cue.id);
      if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
      if (cue.onStart || (this.enabled && this.port.gain(cue.sound) > 0)) {
        const queued = { ...cue, at: this.clock() };
        this.queue.push(queued);
        this.timing('client_audio_queued', queued, { queueDepth: this.queue.length });
      }
    }
    for (const dropped of this.queue.slice(32)) dropped.onCancel?.();
    this.queue = this.queue.slice(0, 32);
    this.tick();
  }
  tick() {
    const now = this.clock();
    this.queue = this.queue.filter(cue => {
      // Presentations may wait behind real actions; expired visuals settle silently.
      const keep = (cue.endAt === undefined || now < cue.endAt) && now - cue.at <= (cue.onStart ? 8000 : this.maxWait(cue.sound))
        && (!!cue.onStart || (this.enabled && this.port.gain(cue.sound) > 0));
      if (!keep) { this.timing('client_audio_dropped', cue, { waitedMs: Math.round(now - cue.at) }); cue.onCancel?.(); }
      return keep;
    });
    for (const lane of ['table', 'notice'] as const) {
      const current = this.running.get(lane);
      if (current?.cue.endAt !== undefined) {
        if (now >= current.cue.endAt) { current.outcome = 'window_end'; this.finish(lane, current, true); continue; }
        this.port.player(current.cue.sound).volume = this.volume(current, now);
      }
      if (current?.ended && now - current.started >= (current.cue.minDurationMs ?? 0)) this.finish(lane, current, false);
      // Do not let an unavailable native seek stall the visual presentation.
      if (current?.cue.onStart && !current.playing && now - current.started > 200) this.beginSilent(current, 'start_timeout');
      // A broken native completion callback must not block the lane indefinitely.
      if (current && now - current.started > ('maxPlayMs' in soundCatalog[current.cue.sound] ? (soundCatalog[current.cue.sound] as { maxPlayMs: number }).maxPlayMs : 5000)) { current.outcome = 'max_play_timeout'; this.finish(lane, current, true); this.port.error(); }
      if (this.running.has(lane)) continue;
      const index = this.queue.findIndex(cue => soundCatalog[cue.sound].lane === lane
        && (!!cue.onStart || (!this.seeking.has(cue.sound) && this.ready(cue.sound))));
      if (index < 0) continue;
      const cue = this.queue[index];
      // An unavailable voice must not block ready effects behind it.
      this.queue.splice(index, 1);
      const run: Run = { cue, started: now, playing: false };
      this.running.set(lane, run);
      void this.start(lane, run);
    }
  }
  private beginVisual(run: Run) {
    if (!run.visualStarted) { run.visualStarted = true; run.cue.onStart?.(); }
  }
  private beginSilent(run: Run, reason = 'unavailable') {
    run.silent = true; run.playing = true; run.ended = true; run.started = this.clock();
    this.timing('client_audio_started', run.cue, { mode: 'silent', reason, queueWaitMs: Math.round(run.started - run.cue.at) });
    this.beginVisual(run);
  }
  private async start(lane: Lane, run: Run) {
    const sound = run.cue.sound, player = this.port.player(sound);
    if (run.cue.onStart && (!this.enabled || this.port.gain(sound) <= 0 || !this.ready(sound) || this.seeking.has(sound))) {
      this.beginSilent(run); return;
    }
    this.seeking.add(sound);
    try {
      player.pause();
      await player.seekTo(run.cue.endAt === undefined ? 0 : Math.max(0, (this.clock() - (run.cue.endAt - 5000)) / 1000));
      if (!this.enabled || this.running.get(lane) !== run || run.silent) return;
      const gain = this.port.gain(sound);
      run.started = this.clock();
      player.volume = this.volume(run, run.started);
      if (player.setPlaybackRate) {
        player.shouldCorrectPitch = true;
        player.setPlaybackRate(sound === 'deal' ? 1.5 : 1, 'high');
      }
      if (run.cue.endAt !== undefined && this.clock() >= run.cue.endAt) { run.outcome = 'window_end'; this.finish(lane, run, true); return; }
      // Android applies the native volume setter asynchronously; do not read it back.
      if (gain <= 0 || this.clock() - run.cue.at > (run.cue.onStart ? 8000 : this.maxWait(sound))) { run.outcome = 'expired'; this.finish(lane, run, false); return; }
      run.remove = this.port.onEnd(sound, () => {
        if (!run.playing || this.running.get(lane) !== run) return;
        run.ended = true;
        if (this.clock() - run.started >= (run.cue.minDurationMs ?? 0)) this.finish(lane, run, false);
      }, () => {
        if (this.running.get(lane) !== run) return;
        this.trace('error', sound); run.outcome = 'error'; this.finish(lane, run, true); this.port.error();
      });
      run.playing = true;
      player.play();
      this.timing('client_audio_started', run.cue, { mode: 'sound', queueWaitMs: Math.round(run.started - run.cue.at) });
      this.beginVisual(run);
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
      this.timing('client_audio_finished', run.cue, { outcome: run.outcome ?? (pause ? 'cancelled' : 'finished'), silent: !!run.silent,
        playMs: Math.round(now - run.started), totalMs: Math.round(now - run.cue.at) });
    }
    this.running.delete(lane);
    run.remove?.();
    if (pause || !run.visualStarted) run.cue.onCancel?.();
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
    for (const cue of this.queue) cue.onCancel?.();
    this.queue = [];
    for (const [lane, run] of this.running) this.finish(lane, run, true);
    // Outstanding seeks retain their lock until settled, even after re-enable.
  }
}
