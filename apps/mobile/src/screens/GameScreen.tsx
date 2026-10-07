import { PokerTable } from '../components/PokerTable';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LobbyRoom, PokerAction } from '@boardgame/shared';
import { ActionButton } from '../components/ActionButton';

interface Props {
  room: LobbyRoom; playerId: string | null; connected: boolean; error: string | null;
  onLeave: () => void; onStart: () => void; onReset: () => void;
  onReveal: (handId: string) => void;
  onAct: (action: PokerAction, amount?: number) => void;
}
const streets = { preflop: '프리플롭', flop: '플롭', turn: '턴', river: '리버', complete: '결과' };
export function GameScreen({ room, playerId, connected, error, onLeave, onStart, onReset, onAct, onReveal }: Props) {
  const hand = room.holdem!;
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const tableWidth = Math.min(windowWidth - 24, 536);

  const [now, setNow] = useState(Date.now());
  const [amount, setAmount] = useState('');
  const [raiseOpen, setRaiseOpen] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  useEffect(() => { setAmount(String(hand.legal?.minRaiseTo ?? 20)); setRaiseOpen(false); }, [hand.id, hand.revision, hand.legal?.minRaiseTo]);
  const legal = hand.legal;
  const done = hand.street === 'complete';
  const host = room.hostId === playerId;
  const actor = hand.players.find(p => p.id === hand.actorId);
  const seconds = hand.deadline ? Math.max(0, Math.ceil((hand.deadline - now) / 1000)) : 0;
  const raiseTo = Number(amount);
  const validRaise = !!legal && /^\d+$/.test(amount) && Number.isSafeInteger(raiseTo) && raiseTo <= legal.maxRaiseTo && (raiseTo >= legal.minRaiseTo || raiseTo === legal.maxRaiseTo);
  function leave() { Alert.alert('방에서 나갈까요?', '진행 중인 패는 폴드되고, 이 자리의 칩을 이어서 사용할 수 없어요. 이미 올인한 패는 정산까지 유지됩니다.', [{ text: '취소', style: 'cancel' }, { text: '나가기', style: 'destructive', onPress: onLeave }]); }
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View><Text style={styles.meta}>FRIENDS TABLE · {room.code}</Text><Text style={styles.title}>홀덤 #{hand.number} · {streets[hand.street]}</Text></View>
      <Pressable accessibilityRole="button" onPress={leave} style={styles.exit}><Text style={styles.muted}>나가기 ↗</Text></Pressable>
    </View>
    <View style={styles.ribbon}><Text style={styles.turn}>{!connected ? '연결 복구 중…' : done ? '이번 판 결과' : legal ? '● 내 차례' : actor ? actor.nickname + '님 차례' : '관전 중'}</Text><Text style={styles.muted}>{!done && seconds + '초'} {done && '가상 칩'}</Text></View>
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <PokerTable key={hand.id} room={room} playerId={playerId} width={tableWidth} seconds={seconds} connected={connected} onReveal={onReveal} />
      <Text style={styles.event}>{hand.lastEvent}</Text>
      {done && hand.canReveal && <Text style={styles.revealNote}>승자의 패가 먼저 공개됐어요. 내 패는 위로 끝까지 넘겼을 때 친구들에게 공개됩니다. 방장이 다음 판을 시작하면 비공개로 마무리돼요.</Text>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {done && <View style={styles.controls}>
      <Text style={styles.title}>이번 판 결과</Text>
      {hand.payouts.map(p => <Text key={p.playerId} style={styles.turn}>{hand.players.find(m => m.id === p.playerId)?.nickname} · {p.handName} · {p.amount} 칩 수령</Text>)}
      {hand.refunds.map((p, i) => <Text key={i} style={styles.muted}>{hand.players.find(m => m.id === p.playerId)?.nickname} · 미성립 베팅 {p.amount} 반환</Text>)}
      {hand.pots.length > 1 && hand.pots.map((p, i) => <Text key={i} style={styles.muted}>{i === 0 ? '메인 팟' : `사이드 팟 ${i}`} {p.amount} · {p.winnerIds.map(id => hand.players.find(m => m.id === id)?.nickname).join(', ')}</Text>)}
      {host ? <><ActionButton title="다음 판 시작" onPress={onStart} disabled={!connected} /><ActionButton title="모두 1,000칩으로 새로 시작" secondary disabled={!connected} onPress={() => Alert.alert('칩을 초기화할까요?', '방에 있는 모든 친구의 칩이 1,000개로 바뀝니다.', [{ text: '취소', style: 'cancel' }, { text: '초기화', onPress: onReset }])} /></> : <Text style={styles.muted}>방장이 다음 판을 시작할 수 있어요.</Text>}
    </View>}
    {!legal && !done && <Text style={styles.muted}>{hand.players.some(p => p.id === playerId) ? '친구의 행동을 기다리는 중이에요.' : '다음 판에 참여할 수 있어요.'}</Text>}
    </ScrollView>
    <View style={{ paddingBottom: insets.bottom }}><ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
    {legal && <View style={styles.controls}>

      <View style={styles.row}><View style={{ flex: 1 }}><ActionButton title="폴드" onPress={() => onAct('fold')} disabled={!connected} secondary /></View><View style={{ flex: 2 }}><ActionButton title={legal.canCheck ? '체크' : `${legal.callAmount} 콜`} onPress={() => onAct(legal.canCheck ? 'check' : 'call')} disabled={!connected} /></View></View>
      {legal.canRaise && <Pressable accessibilityRole="button" onPress={() => setRaiseOpen(v => !v)} style={styles.preset}><Text style={styles.presetText}>{raiseOpen ? '레이즈 접기 ▴' : '레이즈 금액 선택 ▾'}</Text></Pressable>}
      {legal.canRaise && raiseOpen && <>
        <View style={styles.row}>{[legal.minRaiseTo, Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.ceil(hand.pot / 2))), Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, hand.pot))].map((value, i) => <Pressable key={i} accessibilityRole="button" onPress={() => setAmount(String(value))} style={styles.preset}><Text style={styles.presetText}>{['최소', '½ 팟', '팟'][i]} · {value}</Text></Pressable>)}</View><Text style={styles.muted}>이번 라운드 총 베팅액 · 최소 {legal.minRaiseTo}, 최대 {legal.maxRaiseTo}</Text><TextInput accessibilityLabel="레이즈 총 금액" value={amount} onChangeText={setAmount} keyboardType="number-pad" style={styles.input} /><ActionButton title={`${amount || '0'}까지 레이즈`} onPress={() => onAct('raise', raiseTo)} disabled={!connected || !validRaise} /></>}
      <ActionButton title="올인" onPress={() => Alert.alert('올인할까요?', '남은 칩을 모두 베팅합니다.', [{ text: '취소', style: 'cancel' }, { text: '올인', onPress: () => onAct('allIn') }])} disabled={!connected || !legal.canAllIn} secondary />

    </View>}
</ScrollView></View>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B1820' }, content: { paddingHorizontal: 12, paddingBottom: 24, width: '100%', maxWidth: 560, alignSelf: 'center', gap: 12 },
  header: { paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, exit: { padding: 12, borderRadius: 20, backgroundColor: '#1B2D35' }, ribbon: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#1A302D', flexDirection: 'row', justifyContent: 'space-between' },
  revealNote: { color: '#D4C7A7', fontSize: 12, lineHeight: 20, backgroundColor: '#243B38', padding: 14, borderRadius: 12 }, preset: { flex: 1, paddingVertical: 8, backgroundColor: '#34483E', borderRadius: 10, alignItems: 'center' }, presetText: { color: '#E6D5AA', fontSize: 11 },
  meta: { color: '#D5BD7F', fontSize: 11 }, title: { color: '#FAF6E9', fontWeight: '800', fontSize: 19, marginTop: 5 }, muted: { color: '#B2C4B8', fontSize: 12, lineHeight: 20, flexShrink: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, name: { color: '#FAF6E9', fontWeight: '700', flexShrink: 1 }, chips: { color: '#E1C571', fontWeight: '700' },
  event: { color: '#D8E4DB', fontSize: 13, textAlign: 'center' }, turn: { color: '#F4D57C', fontSize: 14, fontWeight: '700', lineHeight: 23 }, controls: { gap: 10, backgroundColor: '#172A2D', padding: 14, borderRadius: 16 },
  input: { backgroundColor: '#101C18', color: '#FAF6E9', padding: 14, borderRadius: 8, fontSize: 18, borderColor: '#647565', borderWidth: 1 }, error: { color: '#FFC09E', lineHeight: 22 },
});
