import { logRecord } from '@boardgame/shared';

/**
 * Opt-in game progression timing (GAME_TIMING_LOG=1). Observation only:
 * entries carry event names, short refs, streets, counts and durations.
 * Never cards, nicknames, room codes, tokens or account identifiers.
 * Durations use this process's monotonic clock; `timestamp` (wall clock)
 * is metadata only and must not be subtracted across machines.
 */
export type GameTimingValue = string | number | boolean | null | undefined;
export type GameTimingEntry = { event: string; monoMs: number } & Record<string, GameTimingValue>;
export type GameTimingSink = (entry: GameTimingEntry) => void;

export function createGameTiming(sink?: GameTimingSink, clock: () => number = () => performance.now()) {
  const origin = clock();
  return {
    enabled: !!sink,
    now: clock,
    emit(event: string, detail: Record<string, GameTimingValue> = {}) {
      if (!sink) return;
      try { sink(logRecord({ event, monoMs: Math.round(clock() - origin), ...detail }) as GameTimingEntry); }
      catch { /* Diagnostics must never change game progression. */ }
    },
  };
}
export type GameTiming = ReturnType<typeof createGameTiming>;
/** First 8 hex chars of the public hand id; clients can derive the same ref. */
export const handRef = (id: string | undefined) => id?.slice(0, 8);
export const elapsed = (from: number, to: number) => Math.round((to - from) * 10) / 10;
