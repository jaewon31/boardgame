import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as SecureStore from 'expo-secure-store';
import type { HoldemView } from '@boardgame/shared';
import { SoundEvents } from '../services/soundEvents';
import { CardPresentation } from '../services/cardPresentation';
import { AudioScheduler } from '../services/audioScheduler';
import { defaultSoundGains, readSoundGains, DEFAULT_MASTER_LEVEL, playerGain, type GameSound } from '../services/soundCatalog';

export function useGameAudio(hand: HoldemView | null, playerId: string | null, connected: boolean, nextHandAt?: number | null) {
  // User-provided replacements; other effects retain their original assets.
  const deal = useAudioPlayer(require('../../assets/audio/deal-user.wav'));
  const check = useAudioPlayer(require('../../assets/audio/check-user.wav'));
  const call = useAudioPlayer(require('../../assets/audio/bet-user.wav'));
  const bet = useAudioPlayer(require('../../assets/audio/bet-user.wav'));
  const raise = useAudioPlayer(require('../../assets/audio/raise-user.wav'));
  const fold = useAudioPlayer(require('../../assets/audio/cards-fold.wav'));
  const flopReveal = useAudioPlayer(require('../../assets/audio/deal-user.wav'));
  const turnReveal = useAudioPlayer(require('../../assets/audio/deal-user.wav'));
  const riverReveal = useAudioPlayer(require('../../assets/audio/deal-user.wav'));
  const potCollect = useAudioPlayer(require('../../assets/audio/pot-collect.wav'));
  const victory = useAudioPlayer(require('../../assets/audio/win.wav'));
  // Historical filename turn.wav is exclusively the MY TURN notification.
  const myTurn = useAudioPlayer(require('../../assets/audio/turn.wav'));
  const warning = useAudioPlayer(require('../../assets/audio/warning.wav'));
  const shuffle = useAudioPlayer(require('../../assets/audio/shuffle-user.wav'));
  const allIn = useAudioPlayer(require('../../assets/audio/allin-user.wav'));
  const players = useMemo(() => ({ deal, check, call, bet, raise, fold, flopReveal, turnReveal, riverReveal, potCollect, victory, myTurn, warning, shuffle, allIn }),
    [deal, check, call, bet, raise, fold, flopReveal, turnReveal, riverReveal, potCollect, victory, myTurn, warning, shuffle, allIn]);
  const [level, setLevelState] = useState(DEFAULT_MASTER_LEVEL), [muted, setMutedState] = useState(false);
  const [gains, setGains] = useState({ ...defaultSoundGains });
  const [loaded, setLoaded] = useState(false), [ready, setReady] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewMode = useRef(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const events = useRef(new SoundEvents());
  const [presentation, setPresentation] = useState<CardPresentation['state']>({ handId: null, boardCount: 0, board: {} });
  const visuals = useMemo(() => new CardPresentation(setPresentation, () => performance.now()), []);
  const writes = useRef(Promise.resolve());
  const mix = useRef({ level, gains });
  mix.current = { level, gains };
  const gate = useRef({ loaded, ready, muted, level, connected, previewOpen });
  gate.current = { loaded, ready, muted, level, connected, previewOpen };
  const scheduler = useMemo(() => new AudioScheduler({
    player: sound => players[sound],
    gain: sound => playerGain(mix.current.level, mix.current.gains[sound]),
    onEnd: (sound, done, failed) => {
      const sub = players[sound].addListener('playbackStatusUpdate', status => {
        if ((status as {error?: unknown}).error) failed?.();
        else if (status.didJustFinish) done();
      });
      return () => sub.remove();
    },
    error: () => setError('효과음을 재생하지 못했어요.'),
    // Fixed event/sound names only: no hand IDs, cards, accounts or native error text.
    trace: (phase, sound) => console.info(JSON.stringify({event:'game_audio', phase, sound})),
  }, () => performance.now()), [players]);
  useEffect(() => {
    let live = true;
    void SecureStore.getItemAsync('table-audio').then(raw => {
      if (!live || !raw) return;
      const value = JSON.parse(raw);
      if (typeof value.level === 'number' && value.level >= 0 && value.level <= 1) setLevelState(value.level);
      if (typeof value.muted === 'boolean') setMutedState(value.muted);
      setGains(readSoundGains(value.gains));
    }).catch(() => { if (live) setError('소리 설정을 불러오지 못했어요.'); }).finally(() => { if (live) setLoaded(true); });
    void setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, allowsRecording: false, interruptionMode: 'mixWithOthers' })
      .then(() => { if (live) setReady(true); }).catch(() => { if (live) setError('오디오 초기화에 실패했어요.'); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        scheduler.setEnabled(false);
        events.current.update(null, null, false, Date.now());
      } else {
        const current = gate.current;
        scheduler.setEnabled(current.loaded && current.ready && !current.muted && current.level > 0 && (current.connected || current.previewOpen));
      }
      setActive(state === 'active');
    });
    const playbackTimer = setInterval(() => scheduler.tick(), 16);
    const clockTimer = setInterval(() => setNow(Date.now()), 250);
    return () => { sub.remove(); clearInterval(playbackTimer); clearInterval(clockTimer); scheduler.setEnabled(false); };
  }, [scheduler]);
  useEffect(() => {
    if (!loaded) return;
    let live = true;
    const raw = JSON.stringify({ level, muted, gains });
    writes.current = writes.current.then(() => SecureStore.setItemAsync('table-audio', raw))
      .catch(() => { if (live) setError('소리 설정을 저장하지 못했어요.'); });
    return () => { live = false; };
  }, [level, muted, gains, loaded]);
  useEffect(() => {
    scheduler.setEnabled(loaded && ready && !muted && level > 0 && active && (connected || previewOpen));
    scheduler.refreshVolumes();
  }, [scheduler, loaded, ready, muted, level, gains, active, connected, previewOpen]);
  useLayoutEffect(() => {
    if (!previewMode.current) scheduler.cancel();
  }, [scheduler, hand?.id, playerId]);
  useLayoutEffect(() => {
    const cues = events.current.update(hand, playerId, connected && active, now, nextHandAt);
    if (!connected || !active || previewMode.current) {
      visuals.restore(hand);
    } else {
      // A restored/initial snapshot has no cues and is displayed without catch-up animation.
      scheduler.enqueue(visuals.prepare(hand, cues));
    }
  }, [scheduler, hand, playerId, connected, active, now, nextHandAt]);
  function setMuted(value: boolean) {
    gate.current.muted = value;
    if (value) scheduler.setEnabled(false);
    setMutedState(value);
  }
  function setLevel(value: number) {
    if (!Number.isFinite(value)) return;
    const next = Math.max(0, Math.min(1, value));
    gate.current.level = next;
    if (!next) scheduler.setEnabled(false);
    setLevelState(next);
  }
  function setSoundGain(sound: GameSound, value: number) {
    if (Number.isFinite(value)) setGains(current => ({ ...current, [sound]: Math.max(0, Math.min(1, value)) }));
  }
  const setPreviewMode = useMemo(() => (open: boolean) => {
    if (previewMode.current !== open) scheduler.cancel();
    previewMode.current = open;
    gate.current.previewOpen = open;
    setPreviewOpen(open);
  }, [scheduler]);
  const previews = useRef(0);
  return { presentation, level, muted, gains, loaded, error, setLevel, setMuted, setSoundGain, setPreviewMode,
    preview: (sound: GameSound = 'myTurn') => scheduler.preview({ id: `preview:${++previews.current}`, sound }) };
}
export type GameAudio = ReturnType<typeof useGameAudio>;
