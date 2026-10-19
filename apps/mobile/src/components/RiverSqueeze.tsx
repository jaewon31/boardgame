import { useEffect, useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Card } from '@boardgame/shared';
import { CardDrawing } from './CardArtwork';

interface Props { card: Card; deadline: number; connected: boolean; onReveal: () => void }
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function RiverSqueeze({ card, deadline, connected, onReveal }: Props) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [opening, setOpening] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState(false);
  const sent = useRef(false);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gestureStart = useRef({ opening: 0 });
  const cardWidth = Math.max(1, Math.min(size.width - 32, (size.height - 24) / 1.4, 500));
  const latest = useRef({ connected, onReveal, cardWidth, opening });
  latest.current = { connected, onReveal, cardWidth, opening };
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 250);
    return () => { clearInterval(clock); clearTimeout(retry.current); };
  }, []);

  function reveal() {
    if (!latest.current.connected || sent.current) return;
    sent.current = true;
    setPending(true);
    latest.current.onReveal();
    // Keep the private peek position if the server acknowledgement is delayed.
    retry.current = setTimeout(() => { sent.current = false; setPending(false); }, 2500);
  }
  const bodyResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => latest.current.connected && !sent.current,
    onMoveShouldSetPanResponder: () => latest.current.connected && !sent.current,
    onPanResponderGrant: () => { gestureStart.current.opening = latest.current.opening; },
    onPanResponderMove: (_, gesture) => {
      setOpening(clamp(gestureStart.current.opening + gesture.dx / (latest.current.cardWidth * .82)));
    },
    // Releasing or an OS interruption keeps the exact peek position.
    onPanResponderTerminationRequest: () => true,
  })).current;

  const edge = opening * 100;
  const bend = Math.sin(opening * Math.PI) * 9;
  const face = `M0 0H${edge} Q${edge - bend} 70 ${edge} 140H0Z`;
  const curl = `M${edge} 0 Q${edge - bend} 70 ${edge} 140 L${edge + bend} 140 Q${edge + bend * .2} 70 ${edge + bend} 0Z`;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));

  return <Modal visible statusBarTranslucent navigationBarTranslucent animationType="fade" presentationStyle="fullScreen" onRequestClose={() => { /* Back must not accidentally publish the river. */ }}>
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.header}><Text style={styles.eyebrow}>RIVER</Text><Text style={styles.clock}>{seconds}초</Text></View>
      <View style={styles.stage} onLayout={e => setSize(e.nativeEvent.layout)}>
        {size.width > 0 && <View style={{ width: cardWidth, height: cardWidth * 1.4 }}>
          <View {...bodyResponder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel="카드 세로 가장자리 벌리기" accessibilityHint="오른쪽으로 천천히 밀어 카드를 확인합니다."
            accessibilityActions={[{ name: 'increment', label: '조금 더 벌리기' }, { name: 'decrement', label: '조금 덮기' }]}
            onAccessibilityAction={e => { if (connected && !pending) setOpening(value => clamp(value + (e.nativeEvent.actionName === 'increment' ? .15 : -.15))); }}
            style={StyleSheet.absoluteFill}>
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Svg width={cardWidth} height={cardWidth * 1.4} viewBox="0 0 100 140">
                <Defs>
                  <ClipPath id="squeezeOutline"><Rect x={.5} y={.5} width={99} height={139} rx={6} /></ClipPath>
                  <ClipPath id="squeezeFace" key={`clip-${opening.toFixed(4)}`}><Path d={face} /></ClipPath>
                  <LinearGradient id="paperCurl" x1="0%" y1="0%" x2="100%" y2="0%">
                    <Stop offset="0" stopColor="#8C8D86" /><Stop offset="30%" stopColor="#FFFDF3" />
                    <Stop offset="65%" stopColor="#E8E2D4" /><Stop offset="1" stopColor="#888E8A" />
                  </LinearGradient>
                </Defs>
                <G clipPath="url(#squeezeOutline)">
                  <CardDrawing back />
                  {opening > 0 && <>
                    <Path d={curl} fill="#000" opacity={.3} transform="translate(2 0)" />
                    <G key={`face-${opening.toFixed(4)}`} clipPath="url(#squeezeFace)">
                      <CardDrawing card={card} />
                    </G>
                    {bend > .05 && <Path d={curl} fill="url(#paperCurl)" />}
                    <Path d={`M${edge} 0Q${edge - bend} 70 ${edge} 140`} fill="none" stroke="#FFFDF5" strokeWidth={.45} />
                  </>}
                </G>
              </Svg>
            </View>
          </View>
        </View>}
      </View>
      <Text style={styles.hint}>{pending ? '공개하는 중…' : !connected ? '연결 복구 중 · 시간이 끝나면 자동 공개' : '오른쪽으로 천천히 밀어보세요'}</Text>
      <Pressable accessibilityRole="button" disabled={!connected || pending} style={[styles.publish, (!connected || pending) && { opacity: .4 }]} onPress={reveal}><Text style={styles.publishText}>모두에게 리버 공개</Text></Pressable>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071B17', paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#CEAE6E', fontSize: 10, letterSpacing: 3 },
  clock: { color: '#EAD39E', fontSize: 16, fontWeight: '700' },
  stage: { flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center' },
  hint: { color: '#9EBAB0', textAlign: 'center', fontSize: 12 },
  publish: { minHeight: 44, backgroundColor: '#DCC58D', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  publishText: { color: '#19372E', fontWeight: '800', fontSize: 14 },
});