export const soundCatalog = {
  shuffle: { label: '카드 셔플', gain: 0.8, priority: 30, lane: 'table', maxWaitMs: 500, maxPlayMs: 7500 },
  allIn: { maxWaitMs: 5000, label: '올인', gain: 0.9, priority: 65, lane: 'table' },
  deal: { label: '카드 배분', gain: 0.8, priority: 60, lane: 'table' },
  check: { maxWaitMs: 5000, label: '체크', gain: 0.65, priority: 40, lane: 'table' },
  call: { maxWaitMs: 5000, label: '콜', gain: 0.8, priority: 45, lane: 'table' },
  bet: { maxWaitMs: 5000, label: '베팅', gain: 0.85, priority: 45, lane: 'table' },
  raise: { maxWaitMs: 5000, label: '레이즈', gain: 0.9, priority: 50, lane: 'table' },
  fold: { maxWaitMs: 5000, label: '폴드', gain: 0.4, priority: 40, lane: 'table' },
  flopReveal: { label: '플롭 공개', gain: 0.8, priority: 60, lane: 'table' },
  turnReveal: { label: '턴 공개', gain: 0.8, priority: 60, lane: 'table' },
  riverReveal: { label: '리버 공개', gain: 0.8, priority: 60, lane: 'table' },
  // Result cues must survive a prior effect plus pot animation; cancelled on hand change.
  potCollect: { maxWaitMs: 5000, label: '팟 획득', gain: 0.8, priority: 80, lane: 'table' },
  victory: { maxWaitMs: 5000, label: '승리', gain: 0.2, priority: 70, lane: 'table' },
  myTurn: { label: '내 차례 알림', gain: 0.3, priority: 80, lane: 'notice' },
  warning: { label: '시간 경고', gain: 0.4, priority: 90, lane: 'notice' },
} as const;
export type GameSound = keyof typeof soundCatalog;
export type SoundGains = Record<GameSound, number>;
export interface SoundCue { id: string; sound: GameSound; presentation?: { kind: 'hole' | 'board'; index?: number } }
// Preserve saved settings. Compensation is linear until the native volume ceiling.
export const DEFAULT_MASTER_LEVEL = 0.75;
export const MAX_PLAYER_VOLUME = 0.8;
export function playerGain(level: number, gain: number) { return Math.min(MAX_PLAYER_VOLUME, Math.max(0, level * gain * 1.5)); }
export const defaultSoundGains = Object.fromEntries(Object.entries(soundCatalog).map(([key, value]) => [key, value.gain])) as SoundGains;
export function readSoundGains(value: unknown): SoundGains {
  const gains = { ...defaultSoundGains };
  if (value && typeof value === 'object') for (const key of Object.keys(gains) as GameSound[]) {
    const gain = (value as Record<string, unknown>)[key];
    if (typeof gain === 'number' && Number.isFinite(gain) && gain >= 0 && gain <= 1) gains[key] = gain;
  }
  return gains;
}
