import { soundCatalog, type GameSound, type SoundCue } from './soundCatalog.ts';

export interface SoundPlayer {
  readonly isLoaded: boolean;
  readonly currentStatus?: { isLoaded: boolean };
  volume: number;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  play(): void;
}
export interface AudioPort {
  player(sound: GameSound): SoundPlayer;
  onEnd(sound: GameSound, done: () => void, failed?: () => void): () => void;
  trace?(event: string, sound: GameSound): void;
  gain(sound: GameSound): number;
  error(): void;
}
type Lane = 'table' | 'notice';
export interface ScheduledCue extends SoundCue {
  minDurationMs?: number;
  onStart?: () => void;
  onCancel?: () => void;
}
interface Queued extends ScheduledCue { at: number }
interface Run { cue: Queued; started: number; playing: boolean; ended?: boolean; visualStarted?: boolean; silent?: boolean; remove?: () => void }

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
      if (cue.onStart || (this.enabled && this.port.gain(cue.sound) > 0)) this.queue.push({ ...cue, at: this.clock() });
    }
    for (const dropped of this.queue.slice(32)) dropped.onCancel?.();
    this.queue = this.queue.slice(0, 32);
    this.tick();
  }
  tick() {
    const now = this.clock();
    this.queue = this.queue.filter(cue => {
      // Presentations may wait behind real actions; expired visuals settle silently.
      const keep = now - cue.at <= (cue.onStart ? 8000 : this.maxWait(cue.sound))
        && (!!cue.onStart || (this.enabled && this.port.gain(cue.sound) > 0));
      if (!keep) cue.onCancel?.();
      return keep;
    });
    for (const lane of ['table', 'notice'] as const) {
      const current = this.running.get(lane);
      if (current?.ended && now - current.started >= (current.cue.minDurationMs ?? 0)) this.finish(lane, current, false);
      // Do not let an unavailable native seek stall the visual presentation.
      if (current?.cue.onStart && !current.playing && now - current.started > 200) this.beginSilent(current);
      // A broken native completion callback must not block the lane indefinitely.
      if (current && now - current.started > ('maxPlayMs' in soundCatalog[current.cue.sound] ? (soundCatalog[current.cue.sound] as { maxPlayMs: number }).maxPlayMs : 5000)) { this.finish(lane, current, true); this.port.error(); }
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
  private beginSilent(run: Run) {
    run.silent = true; run.playing = true; run.ended = true; run.started = this.clock();
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
      await player.seekTo(0);
      if (!this.enabled || this.running.get(lane) !== run || run.silent) return;
      const gain = this.port.gain(sound);
      player.volume = gain;
      // Android applies the native volume setter asynchronously; do not read it back.
      if (gain <= 0 || this.clock() - run.cue.at > (run.cue.onStart ? 8000 : this.maxWait(sound))) { this.finish(lane, run, false); return; }
      run.remove = this.port.onEnd(sound, () => {
        if (!run.playing || this.running.get(lane) !== run) return;
        run.ended = true;
        if (this.clock() - run.started >= (run.cue.minDurationMs ?? 0)) this.finish(lane, run, false);
      }, () => {
        if (this.running.get(lane) !== run) return;
        this.trace('error', sound); this.finish(lane, run, true); this.port.error();
      });
      run.playing = true;
      run.started = this.clock();
      player.play();
      this.beginVisual(run);
      this.trace('play_requested', sound);
    } catch {
      if (this.running.get(lane) === run) { this.finish(lane, run, true); this.port.error(); }
    } finally { this.seeking.delete(sound); }
  }
  private finish(lane: Lane, run: Run, pause: boolean) {
    if (this.running.get(lane) !== run) return;
    this.trace(pause ? 'cancelled' : 'finished', run.cue.sound);
    this.running.delete(lane);
    run.remove?.();
    if (pause || !run.visualStarted) run.cue.onCancel?.();
    if (pause) {
      // Native hook disposal can precede this hook's cleanup.
      try { this.port.player(run.cue.sound).pause(); } catch { /* Already released. */ }
    }
  }
  refreshVolumes() {
    for (const run of this.running.values()) this.port.player(run.cue.sound).volume = this.port.gain(run.cue.sound);
  }
  cancel() {
    for (const cue of this.queue) cue.onCancel?.();
    this.queue = [];
    for (const [lane, run] of this.running) this.finish(lane, run, true);
    // Outstanding seeks retain their lock until settled, even after re-enable.
  }
}
