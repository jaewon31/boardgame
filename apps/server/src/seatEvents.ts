import { createHash, createHmac, randomBytes } from 'node:crypto';
import { logRecord } from '@boardgame/shared';

/**
 * Seat / reconnect / rebuy / chip-audit diagnostics (SEAT_EVENT_LOG, on unless set to 0).
 * Observation only: emitting never changes game state, and every call is a no-op without a sink.
 * Entries carry event names, short one-way refs, seat numbers, chip amounts and durations.
 * Never nicknames, room codes, tokens, account ids, session ids or cards.
 *  - roomRef: HMAC of the room code with a per-process random key (room codes are short, a plain hash would be reversible).
 *  - accountRef: same 16-hex sha256 prefix as the ws_* connection diagnostics, so the two can be correlated.
 * Volume: at most `perRoomPerMinute` entries per room per minute; the rest are counted and reported once.
 */
export type SeatEventValue = string | number | boolean | null | undefined;
export type SeatEventSink = (entry: Record<string, SeatEventValue>) => void;

export function createSeatEvents(sink?: SeatEventSink, perRoomPerMinute = 120, clock: () => number = Date.now) {
  const key = sink ? randomBytes(32) : undefined;
  const windows = new Map<string, { start: number; count: number; dropped: number }>();
  const roomRefs = new Map<string, string>();
  const roomRef = (code: string) => {
    let ref = roomRefs.get(code);
    if (!ref) { ref = createHmac('sha256', key!).update(code).digest('hex').slice(0, 16); if (roomRefs.size > 5000) roomRefs.clear(); roomRefs.set(code, ref); }
    return ref;
  };
  return {
    enabled: !!sink,
    accountRef: (accountId: string | undefined) => accountId ? createHash('sha256').update(accountId).digest('hex').slice(0, 16) : 'anon',
    emit(event: string, roomCode: string, detail: Record<string, SeatEventValue> = {}, level: 'info' | 'error' = 'info') {
      if (!sink) return;
      try {
        const now = clock();
        let w = windows.get(roomCode);
        if (!w || now - w.start >= 60_000) {
          if (w?.dropped) sink(logRecord({ event: 'seat_events_suppressed', roomRef: roomRef(roomCode), dropped: w.dropped }));
          if (windows.size > 5000) windows.clear();
          w = { start: now, count: 0, dropped: 0 };
          windows.set(roomCode, w);
        }
        // Audit failures are never dropped.
        if (++w.count > perRoomPerMinute && level !== 'error') { w.dropped++; return; }
        sink(logRecord({ event, roomRef: roomRef(roomCode), ...detail }, level));
      } catch { /* Diagnostics must never change game progression. */ }
    },
  };
}
export type SeatEvents = ReturnType<typeof createSeatEvents>;
