import { CardArtwork } from './CardArtwork';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import type { CardMotion } from '../services/cardPresentation';
import type { Card } from '@boardgame/shared';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setReduced(v); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}
export function CardFace({ card, width = 42, back = false }: { card?: Card; width?: number; back?: boolean }) {
  const rank = card?.slice(0, -1) ?? '';
  const label = ({ '11': 'J', '12': 'Q', '13': 'K', '14': 'A' } as Record<string, string>)[rank] ?? rank;
  const suit = ({ s: '스페이드', h: '하트', d: '다이아', c: '클로버' } as Record<string, string>)[card?.slice(-1) ?? ''];
  return <View accessible accessibilityLabel={back || !card ? '비공개 카드' : `${label} ${suit}`} style={{ width, height: width * 1.4, borderRadius: width * .06, shadowColor: '#000', shadowOpacity: .2, shadowRadius: 3, elevation: 2 }}><CardArtwork card={card} width={width} back={back} /></View>;
}

export function PlayingCard({ card, width = 42, motion }: { card?: Card; width?: number; motion?: CardMotion }) {
  const progress = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const remaining = motion ? Math.max(0, motion.durationMs - (performance.now() - motion.startedAt)) : 0;
    if (reduced || remaining === 0) { progress.setValue(1); return; }
    progress.setValue(1 - remaining / motion!.durationMs);
    const animation = Animated.timing(progress, { toValue: 1, duration: remaining, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [motion, reduced, progress]);
  return <Animated.View style={{ opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [.4, 1] }), transform: [{ perspective: 800 }, { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] }) }, { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }}><CardFace card={card} width={width} /></Animated.View>;
}
