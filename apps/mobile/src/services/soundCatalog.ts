export const soundCatalog = {
  // Lanes: 'action' and 'board' are latest-wins (a newer event replaces an older one, and a cue that
  // cannot start within maxWaitMs is skipped as stale); 'result' keeps event order; 'notice' is separate.
  shuffle: { label: '카드 셔플', gain: 0.8, priority: 30, lane: 'result', maxWaitMs: 5000, maxPlayMs: 7500 },
  allIn: { maxWaitMs: 500, label: '올인', gain: 0.9, priority: 65, lane: 'action' },
  deal: { maxWaitMs: 500, label: '카드 배분', gain: 0.8, priority: 60, lane: 'board' },
  check: { maxWaitMs: 500, label: '체크', gain: 0.65, priority: 40, lane: 'action' },
  call: { maxWaitMs: 500, label: '콜', gain: 0.8, priority: 45, lane: 'action' },
  bet: { maxWaitMs: 500, label: '베팅', gain: 0.85, priority: 45, lane: 'action' },
  raise: { maxWaitMs: 500, label: '레이즈', gain: 0.9, priority: 50, lane: 'action' },
  fold: { maxWaitMs: 500, label: '폴드', gain: 0.4, priority: 40, lane: 'action' },
  flopReveal: { maxWaitMs: 500, label: '플롭 공개', gain: 0.8, priority: 60, lane: 'board' },
  turnReveal: { maxWaitMs: 500, label: '턴 공개', gain: 0.8, priority: 60, lane: 'board' },
  riverReveal: { maxWaitMs: 500, label: '리버 공개', gain: 0.8, priority: 60, lane: 'board' },
  // Result cues play in order (pot, then victory, then shuffle) and survive each other; cancelled on hand change.
  potCollect: { maxWaitMs: 5000, label: '팟 획득', gain: 0.8, priority: 80, lane: 'result' },
  victory: { maxWaitMs: 5000, label: '승리', gain: 0.2, priority: 70, lane: 'result' },
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
