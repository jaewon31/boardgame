export interface RoomSettings {
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  turnSeconds: number;
  /**
   * Largest chip amount one rebuy request may ask for (host included). Optional for older rooms
   * and clients: absent means the starting chips (see rebuyLimit).
   */
  maxRebuy?: number;
}
/** Technical ceiling for one rebuy request and for the maxRebuy setting. */
export const MAX_REBUY_CHIPS = 1_000_000_000;
/** Effective per-request rebuy limit of a room. */
export const rebuyLimit = (s: RoomSettings) => s.maxRebuy ?? Math.min(s.startingChips, MAX_REBUY_CHIPS);
export const DEFAULT_SETTINGS: Readonly<RoomSettings> = Object.freeze({ startingChips: 1000, smallBlind: 10, bigBlind: 20, turnSeconds: 30 });
export function validRoomSettings(value: unknown): value is RoomSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as RoomSettings;
  return [s.startingChips, s.smallBlind, s.bigBlind, s.turnSeconds].every(Number.isSafeInteger)
    && s.startingChips >= 100 && s.startingChips <= 100000
    && s.smallBlind >= 1 && s.bigBlind > s.smallBlind && s.bigBlind <= 10000
    && s.startingChips >= s.bigBlind * 10 && s.turnSeconds >= 10 && s.turnSeconds <= 120
    && (s.maxRebuy === undefined || (Number.isSafeInteger(s.maxRebuy) && s.maxRebuy >= 1 && s.maxRebuy <= MAX_REBUY_CHIPS));
}
export const SETTINGS_HELP = '시작 칩 100~100,000 · BB는 SB보다 크고 최대 10,000 · 시작 칩은 10BB 이상 · 제한 시간 10~120초';
