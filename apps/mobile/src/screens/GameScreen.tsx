import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Card, LobbyRoom, PokerAction } from '@boardgame/shared';
import { ActionButton } from '../components/ActionButton';

interface Props {
  room: LobbyRoom; playerId: string | null; connected: boolean; error: string | null;
  onLeave: () => void; onStart: () => void; onReset: () => void;
  onAct: (action: PokerAction, amount?: number) => void;
}
const streets = { preflop: '프리플롭', flop: '플롭', turn: '턴', river: '리버', complete: '결과' };
function Cards({ cards, count = 2 }: { cards: Card[] | null; count?: number }) {
  return <View style={styles.cards}>{Array.from({ length: count }, (_, i) => {
    const card = cards?.[i];
    const rank = card ? Number(card.slice(0, -1)) : 0;
    const suit = card?.slice(-1);
    const label = card ? `${({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[rank] ?? rank}${({ s: '♠', h: '♥', d: '♦', c: '♣' } as Record<string, string>)[suit!]}` : '◆';
    return <View key={i} style={[styles.card, !card && styles.back]}><Text accessibilityLabel={card ? label : '비공개 카드'} style={[styles.face, (suit === 'h' || suit === 'd') && styles.red, !card && styles.hidden]}>{label}</Text></View>;
  })}</View>;
}
export function GameScreen({ room, playerId, connected, error, onLeave, onStart, onReset, onAct }: Props) {
  const hand = room.holdem!;
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now());
  const [amount, setAmount] = useState('');
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  useEffect(() => { setAmount(String(hand.legal?.minRaiseTo ?? 20)); }, [hand.id, hand.revision, hand.legal?.minRaiseTo]);
  const legal = hand.legal;
  const done = hand.street === 'complete';
  const host = room.hostId === playerId;
  const actor = hand.players.find(p => p.id === hand.actorId);
  const seconds = hand.deadline ? Math.max(0, Math.ceil((hand.deadline - now) / 1000)) : 0;
  const raiseTo = Number(amount);
  const validRaise = !!legal && /^\d+$/.test(amount) && Number.isSafeInteger(raiseTo) && raiseTo <= legal.maxRaiseTo && (raiseTo >= legal.minRaiseTo || raiseTo === legal.maxRaiseTo);
  function leave() { Alert.alert('방에서 나갈까요?', '진행 중인 패는 폴드되고, 이 자리의 칩을 이어서 사용할 수 없어요. 이미 올인한 패는 정산까지 유지됩니다.', [{ text: '취소', style: 'cancel' }, { text: '나가기', style: 'destructive', onPress: onLeave }]); }
  return <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 }]}>
    <Text style={styles.meta}>FRIENDS TABLE · {room.code} · {connected ? '연결됨' : '재연결 중'}</Text>
    <Text style={styles.title}>홀덤 #{hand.number} · {streets[hand.street]}</Text>
    <Text style={styles.muted}>블라인드 {hand.smallBlind}/{hand.bigBlind} · 가상 칩</Text>
    <View style={styles.table}>
      <Text style={styles.pot}>{done ? '정산한 팟' : '팟'} {hand.pot.toLocaleString()}</Text>
      <Cards cards={hand.board} count={5} />
      <Text style={styles.event}>{hand.lastEvent}</Text>
      {!done && <Text style={styles.turn}>{actor?.nickname}님 차례 · {seconds}초</Text>}
    </View>
    {hand.players.map(p => <View key={p.id} style={[styles.player, hand.actorId === p.id && styles.active]}>
      <View style={styles.row}><Text style={styles.name}>{p.nickname}{p.id === playerId ? ' (나)' : ''} {p.id === hand.dealerId ? 'Ⓓ' : ''} {p.id === hand.smallBlindId ? 'SB' : p.id === hand.bigBlindId ? 'BB' : ''}</Text><Text style={styles.chips}>{p.stack.toLocaleString()} 칩</Text></View>
      <View style={styles.row}><Cards cards={p.cards} /><Text style={styles.muted}>{p.folded ? '폴드' : !done && p.allIn ? '올인' : `이번 라운드 ${p.roundBet}`} {!room.players.find(m => m.id === p.id)?.connected ? '· 연결 끊김' : ''}</Text></View>
    </View>)}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {legal && <View style={styles.controls}>
      <Text style={styles.turn}>내 차례예요</Text>
      <View style={styles.row}><ActionButton title="폴드" onPress={() => onAct('fold')} disabled={!connected} secondary /><ActionButton title={legal.canCheck ? '체크' : `${legal.callAmount} 콜`} onPress={() => onAct(legal.canCheck ? 'check' : 'call')} disabled={!connected} /></View>
      {legal.canRaise && <><Text style={styles.muted}>이번 라운드 총 베팅액 · 최소 {legal.minRaiseTo}, 최대 {legal.maxRaiseTo}</Text><TextInput accessibilityLabel="레이즈 총 금액" value={amount} onChangeText={setAmount} keyboardType="number-pad" style={styles.input} /><ActionButton title={`${amount || '0'}까지 레이즈`} onPress={() => onAct('raise', raiseTo)} disabled={!connected || !validRaise} /></>}
      <ActionButton title="올인" onPress={() => Alert.alert('올인할까요?', '남은 칩을 모두 베팅합니다.', [{ text: '취소', style: 'cancel' }, { text: '올인', onPress: () => onAct('allIn') }])} disabled={!connected || !legal.canAllIn} secondary />
      <Text style={styles.muted}>시간이 지나면 체크가 가능할 때 체크, 아니면 폴드합니다.</Text>
    </View>}
    {done && <View style={styles.controls}>
      <Text style={styles.title}>이번 판 결과</Text>
      {hand.payouts.map(p => <Text key={p.playerId} style={styles.turn}>{hand.players.find(m => m.id === p.playerId)?.nickname} · {p.handName} · {p.amount} 칩 수령</Text>)}
      {hand.refunds.map((p, i) => <Text key={i} style={styles.muted}>{hand.players.find(m => m.id === p.playerId)?.nickname} · 미성립 베팅 {p.amount} 반환</Text>)}
      {hand.pots.length > 1 && hand.pots.map((p, i) => <Text key={i} style={styles.muted}>{i === 0 ? '메인 팟' : `사이드 팟 ${i}`} {p.amount} · {p.winnerIds.map(id => hand.players.find(m => m.id === id)?.nickname).join(', ')}</Text>)}
      {host ? <><ActionButton title="다음 판 시작" onPress={onStart} disabled={!connected} /><ActionButton title="모두 1,000칩으로 새로 시작" secondary disabled={!connected} onPress={() => Alert.alert('칩을 초기화할까요?', '방에 있는 모든 친구의 칩이 1,000개로 바뀝니다.', [{ text: '취소', style: 'cancel' }, { text: '초기화', onPress: onReset }])} /></> : <Text style={styles.muted}>방장이 다음 판을 시작할 수 있어요.</Text>}
    </View>}
    {!legal && !done && <Text style={styles.muted}>{hand.players.some(p => p.id === playerId) ? '친구의 행동을 기다리는 중이에요.' : '다음 판에 참여할 수 있어요.'}</Text>}
    <ActionButton title="방 나가기" onPress={leave} secondary />
  </ScrollView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101C18' }, content: { paddingHorizontal: 20, width: '100%', maxWidth: 600, alignSelf: 'center', gap: 12 },
  meta: { color: '#D5BD7F', fontSize: 11 }, title: { color: '#FAF6E9', fontWeight: '800', fontSize: 23 }, muted: { color: '#B2C4B8', fontSize: 12, lineHeight: 20, flexShrink: 1 },
  table: { backgroundColor: '#254E39', borderRadius: 24, padding: 20, alignItems: 'center', gap: 14 }, pot: { color: '#F5DE99', fontSize: 22, fontWeight: '800' },
  cards: { flexDirection: 'row', gap: 5 }, card: { backgroundColor: '#FFF7E4', borderRadius: 6, width: 43, height: 56, justifyContent: 'center', alignItems: 'center' }, back: { backgroundColor: '#36564A', borderWidth: 1, borderColor: '#72917F' },
  face: { color: '#192620', fontSize: 21, fontWeight: '800' }, red: { color: '#B73536' }, hidden: { color: '#A8C7B3' },
  player: { backgroundColor: '#1A2B22', borderRadius: 14, padding: 12, gap: 10, borderWidth: 1, borderColor: '#304338' }, active: { borderColor: '#E1C571', borderWidth: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, name: { color: '#FAF6E9', fontWeight: '700', flexShrink: 1 }, chips: { color: '#E1C571', fontWeight: '700' },
  event: { color: '#D8E4DB', fontSize: 13 }, turn: { color: '#F4D57C', fontSize: 14, fontWeight: '700', lineHeight: 23 }, controls: { gap: 12, backgroundColor: '#1A2B22', padding: 16, borderRadius: 16 },
  input: { backgroundColor: '#101C18', color: '#FAF6E9', padding: 14, borderRadius: 8, fontSize: 18, borderColor: '#647565', borderWidth: 1 }, error: { color: '#FFC09E', lineHeight: 22 },
});
