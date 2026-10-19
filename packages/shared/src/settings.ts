export interface RoomSettings {
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  turnSeconds: number;
}
export const DEFAULT_SETTINGS: Readonly<RoomSettings> = Object.freeze({ startingChips: 1000, smallBlind: 10, bigBlind: 20, turnSeconds: 30 });
export function validRoomSettings(value: unknown): value is RoomSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as RoomSettings;
  return [s.startingChips, s.smallBlind, s.bigBlind, s.turnSeconds].every(Number.isSafeInteger)
    && s.startingChips >= 100 && s.startingChips <= 100000
    && s.smallBlind >= 1 && s.bigBlind > s.smallBlind && s.bigBlind <= 10000
    && s.startingChips >= s.bigBlind * 10 && s.turnSeconds >= 10 && s.turnSeconds <= 120;
}
export const SETTINGS_HELP = '시작 칩 100~100,000 · BB는 SB보다 크고 최대 10,000 · 시작 칩은 10BB 이상 · 제한 시간 10~120초';
