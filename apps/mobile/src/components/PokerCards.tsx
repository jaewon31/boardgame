import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const rank = card ? Number(card.slice(0, -1)) : 0;
  const suit = card?.slice(-1);
  const symbol = ({ s: '♠', h: '♥', d: '♦', c: '♣' } as Record<string, string>)[suit ?? ''];
  const label = ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[rank] ?? String(rank);
  const red = suit === 'h' || suit === 'd';
  return <View accessible accessibilityLabel={back || !card ? '비공개 카드' : `${label}${symbol}`} style={[styles.card, { width, height: width * 1.4 }, (back || !card) && styles.back]}>
    {back || !card ? <View style={styles.pattern}><Text style={[styles.diamond, { fontSize: width * .42 }]}>◆</Text></View> : <>
      <Text style={[styles.corner, { fontSize: width * .3 }, red && styles.red]}>{label}{symbol}</Text>
      <Text style={[styles.suit, { fontSize: width * .52 }, red && styles.red]}>{symbol}</Text>
    </>}
  </View>;
}
export function PlayingCard({ card, width = 42, delay = 0 }: { card?: Card; width?: number; delay?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    progress.setValue(card ? 0 : 1);
    const animation = Animated.timing(progress, { toValue: 1, duration: reduced ? 0 : 360, delay: reduced ? 0 : delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [card, delay, reduced, progress]);
  return <Animated.View style={{ opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [.4, 1] }), transform: [{ perspective: 800 }, { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] }) }, { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }}><CardFace card={card} width={width} /></Animated.View>;
}

// Local preview only: a completed drag sends one server reveal command for this hand.
// Cancelled/short drags never publish cards to another participant.
export function SqueezeHand({ cards, disabled, onReveal }: { cards: Card[]; disabled: boolean; onReveal: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const sent = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const reduced = useReducedMotion();
  const latest = useRef({ disabled, onReveal });
  latest.current = { disabled, onReveal };
  function reset() { Animated.spring(progress, { toValue: 0, useNativeDriver: true, tension: 90, friction: 10 }).start(); }
  function reveal() {
    if (sent.current || latest.current.disabled) return;
    sent.current = true; setPending(true);
    latest.current.onReveal();
    timer.current = setTimeout(() => { sent.current = false; setPending(false); reset(); }, 2500);
  }
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.current.disabled && !sent.current,
    onStartShouldSetPanResponderCapture: () => !latest.current.disabled && !sent.current,
    onMoveShouldSetPanResponder: () => !latest.current.disabled && !sent.current,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => progress.stopAnimation(),
    onPanResponderMove: (_, gesture) => progress.setValue(Math.max(0, Math.min(1, -gesture.dy / 95))),
    onPanResponderRelease: (_, gesture) => {
      if (-gesture.dy >= 80 && !latest.current.disabled) { progress.setValue(1); reveal(); } else reset();
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: reset,
  })).current;
  useEffect(() => () => { clearTimeout(timer.current); progress.stopAnimation(); }, [progress]);
  return <View style={styles.squeeze}>
    <View {...responder.panHandlers} accessible accessibilityLabel="내 패 두 장. 위로 충분히 밀고 손을 떼면 모두에게 공개됩니다." style={styles.pair}>
      {cards.map((card, index) => <View pointerEvents="none" key={index} style={{ transform: [{ rotate: index === 0 ? '-6deg' : '6deg' }] }}>
        <CardFace card={card} width={48} />
        <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { opacity: progress.interpolate({ inputRange: [0, .85, 1], outputRange: [1, 1, 0] }), transform: [{ perspective: 600 }, { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, reduced ? -98 : -65] }) }, { rotateX: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', reduced ? '0deg' : '65deg'] }) }] }]}><CardFace width={48} back /></Animated.View>
      </View>)}
    </View>
    <View style={{ width: 140, gap: 8 }}><Text style={styles.hint}>{pending ? '공개 요청 중…' : '↑ 위로 째서 확인 · 끝까지 넘기면 공개'}</Text>
    <Pressable accessibilityRole="button" disabled={disabled || pending} onPress={reveal} style={[styles.revealButton, (disabled || pending) && { opacity: .4 }]}><Text style={styles.revealText}>내 패 모두에게 공개</Text></Pressable></View>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderRadius: 7, backgroundColor: '#FFF7E5', borderColor: '#E3D4B7', borderWidth: 1, padding: 3, justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: .24, shadowRadius: 3, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  back: { backgroundColor: '#203F69', borderColor: '#87A7CA', padding: 4 }, pattern: { flex: 1, borderWidth: 1, borderColor: '#7495BD', borderRadius: 4, alignItems: 'center', justifyContent: 'center' }, diamond: { color: '#ABC4E0' },
  corner: { color: '#1C2C2E', fontWeight: '900' }, suit: { color: '#1C2C2E', textAlign: 'center', marginBottom: 2 }, red: { color: '#C54150' },
  squeeze: { flexDirection: 'row', alignItems: 'center', gap: 8 }, pair: { flexDirection: 'row', gap: 12, paddingTop: 12, paddingHorizontal: 8 }, hint: { color: '#EAD6A3', fontSize: 11, textAlign: 'center' },
  revealButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 20, borderColor: '#CDB779', borderWidth: 1 }, revealText: { color: '#FFE7A8', fontWeight: '700', fontSize: 13 },
});
