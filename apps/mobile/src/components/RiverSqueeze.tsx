import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Card } from '@boardgame/shared';
import { CardDrawing } from './CardArtwork';
import { useReducedMotion } from './PokerCards';

interface Props { card: Card; deadline: number; connected: boolean; onReveal: () => void }
export function RiverSqueeze({ card, deadline, connected, onReveal }: Props) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'top' | 'diagonal'>('top');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [progress, setProgress] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState(false);
  const motion = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const sent = useRef(false);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ mode, connected, onReveal, cardWidth: 0, reduced });
  const cardWidth = Math.max(1, Math.min(size.width - 32, (size.height - 16) / 1.4, 500));
  latest.current = { mode, connected, onReveal, cardWidth, reduced };
  useEffect(() => {
    const listener = motion.addListener(({ value }) => setProgress(value));
    const clock = setInterval(() => setNow(Date.now()), 250);
    return () => { motion.removeListener(listener); motion.stopAnimation(); clearInterval(clock); clearTimeout(retry.current); };
  }, [motion]);
  function reset() { Animated.timing(motion, { toValue: 0, duration: latest.current.reduced ? 0 : 200, useNativeDriver: false }).start(); }
  function reveal() {
    if (!latest.current.connected || sent.current) return;
    sent.current = true; setPending(true); motion.setValue(1);
    latest.current.onReveal();
    retry.current = setTimeout(() => { sent.current = false; setPending(false); reset(); }, 2500);
  }
  function amount(dx: number, dy: number) {
    const width = latest.current.cardWidth;
    const distance = latest.current.mode === 'top' ? dy / (width * 1.4 * .7) : (dx + dy) / (width * 2.4 * .65);
    return Math.max(0, Math.min(1, distance));
  }
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => latest.current.connected && !sent.current,
    onMoveShouldSetPanResponder: () => latest.current.connected && !sent.current,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => motion.stopAnimation(),
    onPanResponderMove: (_, gesture) => motion.setValue(amount(gesture.dx, gesture.dy)),
    onPanResponderRelease: (_, gesture) => { if (amount(gesture.dx, gesture.dy) >= .9) reveal(); else reset(); },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: reset,
  })).current;
  // Reflect the printed underside across the moving crease. The lifted piece
  // occupies a new position; no front texture is painted through a hole in the back.
  const fold = progress * (mode === 'top' ? 68 : 112);
  const flap = mode === 'top'
    ? `M0 ${fold} Q50 ${fold - 4 * progress} 100 ${fold} L100 ${fold * 2} Q50 ${fold * 2 + 3 * progress} 0 ${fold * 2}Z`
    : `M0 ${fold} L${fold} 0 L${fold} ${fold}Z`;
  const back = mode === 'top' ? `M0 ${fold}H100V140H0Z` : `M0 ${fold}L${fold} 0H100V140H0Z`;
  const reflection = mode === 'top' ? `matrix(-1 0 0 -1 100 ${fold * 2})` : `matrix(-1 0 0 -1 ${fold} ${fold})`;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  function choose(value: typeof mode) { if (pending) return; motion.stopAnimation(); motion.setValue(0); setMode(value); }
  return <Modal visible statusBarTranslucent navigationBarTranslucent animationType="fade" presentationStyle="fullScreen" onRequestClose={reveal}>
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>RIVER</Text><Text style={styles.title}>리버 카드</Text></View><Text style={styles.clock}>{seconds}초</Text></View>
      <Text style={styles.caption}>{!connected ? '연결 복구 중 · 시간이 지나면 자동 공개돼요.' : '턴 기준으로 뒤지고 있어요. 리버를 직접 확인하세요.'}</Text>
      <View style={styles.modes}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === 'top', disabled: pending }} disabled={pending} style={[styles.mode, mode === 'top' && styles.selected]} onPress={() => choose('top')}><Text style={styles.modeText}>↓ 위에서 · 무늬</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === 'diagonal', disabled: pending }} disabled={pending} style={[styles.mode, mode === 'diagonal' && styles.selected]} onPress={() => choose('diagonal')}><Text style={styles.modeText}>↘ 대각선 · 숫자</Text></Pressable>
      </View>
      <View style={styles.stage} onLayout={e => setSize(e.nativeEvent.layout)}>
        {size.width > 0 && <View {...responder.panHandlers} accessible accessibilityLabel={mode === 'top' ? '리버 카드. 위에서 아래로 드래그해서 무늬 확인' : '리버 카드. 왼쪽 위에서 오른쪽 아래로 드래그해서 숫자 확인'} style={{ width: cardWidth, height: cardWidth * 1.4 }}>
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Svg width={cardWidth} height={cardWidth * 1.4} viewBox="0 0 100 140">
              <Defs>
                <ClipPath id="riverCard"><Rect x={.5} y={.5} width={99} height={139} rx={6} /></ClipPath>
                <ClipPath id="backRemaining" key={`back-${mode}-${progress.toFixed(3)}`}><Path d={back} /></ClipPath>
                <ClipPath id="turnedFlap" key={`flap-${mode}-${progress.toFixed(3)}`}><Path d={flap} /></ClipPath>
                <LinearGradient id="curlLight" x1="0%" y1="0%" x2={mode === 'top' ? '0%' : '100%'} y2="100%">
                  <Stop offset={mode === 'top' ? '0%' : '50%'} stopColor="#131B23" stopOpacity={.48} />
                  <Stop offset={mode === 'top' ? '24%' : '62%'} stopColor="#FFFFFF" stopOpacity={.08} />
                  <Stop offset="70%" stopColor="#FFFFFF" stopOpacity={.04} />
                  <Stop offset="100%" stopColor="#8A8C89" stopOpacity={.32} />
                </LinearGradient>
              </Defs>
              {pending ? <CardDrawing card={card} /> : <G clipPath="url(#riverCard)">
                <G key={`back-${mode}-${progress.toFixed(3)}`} clipPath="url(#backRemaining)"><CardDrawing back /></G>
                {progress > 0 && <>
                  <Path d={flap} fill="#000" opacity={.22} transform="translate(1 3)" />
                  <Path d={flap} fill="#000" opacity={.15} transform="translate(0 1.5)" />
                  <G key={`face-${mode}-${progress.toFixed(3)}`} clipPath="url(#turnedFlap)">
                    <G transform={reflection}><CardDrawing card={card} /></G>
                    <Path d={flap} fill="url(#curlLight)" />
                  </G>
                  <Path d={mode === 'top' ? `M0 ${fold * 2}Q50 ${fold * 2 + 3 * progress} 100 ${fold * 2}` : `M${fold} 0V${fold}H0`} fill="none" stroke="#FFFDF2" strokeWidth={.6} />
                </>}
              </G>}
            </Svg>
          </View>
        </View>}
      </View>
      <Text style={styles.hint}>{pending ? '모두에게 공개하는 중…' : mode === 'top' ? '상단 가운데에서 아래로 천천히 당겨보세요.' : '왼쪽 위 모서리를 오른쪽 아래로 당겨보세요.'}</Text>
      <Text style={styles.fine}>짧게 놓으면 다시 덮고, 끝까지 넘기면 모두에게 공개</Text>
      <Pressable accessibilityRole="button" disabled={!connected || pending} style={[styles.publish, (!connected || pending) && { opacity: .4 }]} onPress={reveal}><Text style={styles.publishText}>리버 바로 공개</Text></Pressable>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071B17', paddingHorizontal: 16 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#CEAE6E', fontSize: 10, letterSpacing: 3 }, title: { color: '#FFF6E4', fontSize: 20, fontWeight: '800' }, clock: { color: '#EAD39E', fontSize: 20, fontWeight: '700' },
  caption: { color: '#9EBAB0', fontSize: 11, marginVertical: 8 }, modes: { flexDirection: 'row', gap: 8 }, mode: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 6, borderWidth: 1, borderColor: '#355B50' }, selected: { backgroundColor: '#325348', borderColor: '#D3B778' }, modeText: { color: '#F5E7C7', fontSize: 13, fontWeight: '700' },
  stage: { flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center' }, hint: { color: '#F2E4C2', textAlign: 'center', fontSize: 12 }, fine: { color: '#9EBAB0', textAlign: 'center', fontSize: 10, marginTop: 4 },
  publish: { minHeight: 44, backgroundColor: '#DCC58D', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, publishText: { color: '#19372E', fontWeight: '800', fontSize: 14 },
});
