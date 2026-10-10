import { RiverSqueeze } from '../components/RiverSqueeze';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LobbyRoom, PokerAction } from '@boardgame/shared';
import { PokerTable } from '../components/PokerTable';
import { ActionButton } from '../components/ActionButton';

interface Props {
  room: LobbyRoom; playerId: string | null; connected: boolean; error: string | null;
  onRevealRiver: (handId: string) => void;
  onLeave: () => void; onReset: () => void; onReveal: (handId: string) => void;
  onAct: (action: PokerAction, amount?: number) => void;
}
const streets = { preflop: '프리플롭', flop: '플롭', turn: '턴', river: '리버', complete: '결과' };
export function GameScreen({ room, playerId, connected, error, onLeave, onReset, onAct, onReveal, onRevealRiver }: Props) {
  const hand = room.holdem!;
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [now, setNow] = useState(Date.now());
  const [amount, setAmount] = useState('');
  const [panel, setPanel] = useState<'raise' | 'result' | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  useEffect(() => { setAmount(String(hand.legal?.minRaiseTo ?? 20)); setPanel(null); setPage(0); }, [hand.id, hand.revision, hand.legal?.minRaiseTo]);
  const legal = hand.legal;
  const runout = hand.runout;
  const runoutSeconds = runout ? Math.max(0, Math.ceil((runout.deadline - now) / 1000)) : 0;
  const squeezeName = hand.players.find(p => p.id === runout?.playerId)?.nickname;
  const nextLabel = runout?.nextStreet === 'showdown' ? '결과 확인' : runout ? streets[runout.nextStreet] + ' 공개' : '';
  const done = hand.street === 'complete';
  const ended = done && (room.fundedPlayers ?? 2) < 2;
  const actor = hand.players.find(p => p.id === hand.actorId);
  const me = hand.players.find(p => p.id === playerId);
  const seconds = hand.deadline ? Math.max(0, Math.ceil((hand.deadline - now) / 1000)) : 0;
  const nextSeconds = room.nextHandAt ? Math.max(0, Math.ceil((room.nextHandAt - now) / 1000)) : 0;
  const raiseTo = Number(amount);
  const validRaise = !!legal && /^\d+$/.test(amount) && Number.isSafeInteger(raiseTo) && raiseTo <= legal.maxRaiseTo && (raiseTo >= legal.minRaiseTo || raiseTo === legal.maxRaiseTo);
  const name = (id: string) => hand.players.find(p => p.id === id)?.nickname ?? '퇴장한 친구';
  const results = [
    ...hand.payouts.map(p => `${name(p.playerId)} · ${p.handName} · +${p.amount}`),
    ...hand.refunds.map(p => `${name(p.playerId)} · 미성립 베팅 ${p.amount} 반환`),
    ...hand.pots.map((p, i) => `${i ? `사이드 팟 ${i}` : '메인 팟'} ${p.amount} · ${p.winnerIds.map(name).join(', ')}`),
  ];
  const status = !connected ? '연결 복구 중…' : done ? ended ? '경기 종료' : room.nextHandAt ? `${nextSeconds}초 후 다음 판` : '접속 중인 플레이어 2명 대기' : runout ? runout.phase === 'squeezing' ? `${squeezeName}님 리버 째기 · ${runoutSeconds}초` : `${nextLabel} · ${runoutSeconds}초` : legal ? '● 내 차례' : actor ? `${actor.nickname}님 차례 · ${seconds}초` : '관전 중';
  function leave() { Alert.alert('방에서 나갈까요?', '진행 중인 패는 폴드되고 이 자리의 칩을 잃어요.', [{ text: '취소', style: 'cancel' }, { text: '나가기', style: 'destructive', onPress: onLeave }]); }
  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <View style={styles.header}><View><Text style={styles.meta}>FRIENDS TABLE · {room.code}</Text><Text style={styles.title}>홀덤 #{hand.number} · {streets[hand.street]}</Text></View><Pressable accessibilityRole="button" onPress={leave} style={styles.link}><Text style={styles.text}>나가기 ↗</Text></Pressable></View>
    <View style={styles.ribbon}><Text numberOfLines={1} style={styles.gold}>{status}</Text></View>
    <View style={styles.table} onLayout={e => setSize(e.nativeEvent.layout)}>
      {size.width > 0 && size.height > 0 && <PokerTable room={room} playerId={playerId} width={size.width} height={size.height} seconds={seconds} connected={connected} onReveal={onReveal} />}
    </View>
    <View style={styles.footer}>
      <Pressable accessibilityRole="button" accessibilityLabel="게임 알림 자세히 보기" onPress={() => Alert.alert('게임 알림', error || hand.lastEvent)}><Text numberOfLines={1} style={error ? styles.error : styles.event}>{error || hand.lastEvent}</Text></Pressable>
      {legal ? <>
        <View style={styles.row}><View style={styles.grow}><ActionButton compact title="폴드" onPress={() => onAct('fold')} disabled={!connected} secondary /></View><View style={styles.grow}><ActionButton compact title={legal.canCheck ? '체크' : `${legal.callAmount} 콜`} onPress={() => onAct(legal.canCheck ? 'check' : 'call')} disabled={!connected} /></View></View>
        <View style={styles.row}><View style={styles.grow}><ActionButton compact title="레이즈" onPress={() => setPanel('raise')} disabled={!connected || !legal.canRaise} secondary /></View><View style={styles.grow}><ActionButton compact title="올인" onPress={() => Alert.alert('올인할까요?', '남은 칩을 모두 베팅합니다.', [{ text: '취소', style: 'cancel' }, { text: '올인', onPress: () => onAct('allIn') }])} disabled={!connected || !legal.canAllIn} secondary /></View></View>
      </> : done ? <>
        <Text numberOfLines={1} style={styles.text}>{ended ? '칩이 남은 플레이어가 승리했어요.' : me?.stack === 0 ? '칩을 모두 잃었어요. 다음 판부터 관전합니다.' : hand.canReveal ? '내 패 공개는 선택 · 공개 버튼으로 친구에게 보여주세요.' : '칩이 남은 플레이어끼리 자동으로 계속해요.'}</Text>
        <View style={styles.row}><View style={styles.grow}><ActionButton compact title="결과 자세히" secondary onPress={() => setPanel('result')} /></View>{ended && room.hostId === playerId && <View style={styles.grow}><ActionButton compact title="새 경기 준비" disabled={!connected} onPress={() => Alert.alert('새 경기를 준비할까요?', '모두 1,000칩으로 대기실에 돌아갑니다.', [{ text: '취소', style: 'cancel' }, { text: '준비', onPress: onReset }])} /></View>}</View>
      </> : <Text style={styles.text}>{runout ? runout.phase === 'squeezing' ? '리버를 확인하는 중이에요. 잠시 기다려 주세요.' : '베팅이 끝났어요. 공용 카드를 순서대로 공개합니다.' : !me ? '관전 중 · 칩이 없으면 다음 판에 참여하지 않아요.' : me.folded ? '폴드했어요. 다음 판은 자동으로 시작됩니다.' : '친구의 행동을 기다리는 중이에요.'}</Text>}
    </View>
    {runout?.phase === 'squeezing' && runout.playerId === playerId && runout.card && <RiverSqueeze key={hand.id} card={runout.card} deadline={runout.deadline} connected={connected} onReveal={() => onRevealRiver(hand.id)} />}
    <Modal visible={panel !== null} transparent animationType="fade" onRequestClose={() => setPanel(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.panel}>
          <View style={styles.row}><Text style={styles.title}>{panel === 'raise' ? '레이즈 금액' : '이번 판 결과'}</Text><Pressable accessibilityRole="button" onPress={() => setPanel(null)} style={styles.link}><Text style={styles.gold}>닫기 ✕</Text></Pressable></View>
          {panel === 'raise' && legal && <>
            <View style={styles.row}>{[legal.minRaiseTo, Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.ceil(hand.pot / 2))), Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, hand.pot))].map((value, i) => <Pressable key={i} accessibilityRole="button" onPress={() => setAmount(String(value))} style={styles.preset}><Text style={styles.text}>{['최소', '½ 팟', '팟'][i]} {value}</Text></Pressable>)}</View>
            <Text style={styles.text}>라운드 총액 · 최소 {legal.minRaiseTo} / 최대 {legal.maxRaiseTo}</Text>
            <TextInput accessibilityLabel="레이즈 총 금액" value={amount} onChangeText={setAmount} keyboardType="number-pad" maxLength={9} style={styles.input} />
            <ActionButton compact title={`${amount || '0'}까지 레이즈`} onPress={() => { setPanel(null); onAct('raise', raiseTo); }} disabled={!connected || !validRaise} />
          </>}
          {panel === 'result' && <>
            {results.slice(page * 3, page * 3 + 3).map((line, i) => <Text key={i} style={styles.result}>{line}</Text>)}
            <View style={styles.row}><View style={styles.grow}><ActionButton compact title="이전" secondary disabled={page === 0} onPress={() => setPage(p => p - 1)} /></View><Text style={styles.text}>{page + 1}/{Math.max(1, Math.ceil(results.length / 3))}</Text><View style={styles.grow}><ActionButton compact title="다음" secondary disabled={(page + 1) * 3 >= results.length} onPress={() => setPage(p => p + 1)} /></View></View>
          </>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B1820' }, header: { paddingHorizontal: 16, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meta: { color: '#D5BD7F', fontSize: 10 }, title: { color: '#FAF6E9', fontSize: 18, fontWeight: '800' }, link: { padding: 12, minHeight: 44, justifyContent: 'center' },
  ribbon: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#1A302D' }, gold: { color: '#F4D57C', fontSize: 13, fontWeight: '700' },
  table: { flex: 1, minHeight: 0, marginHorizontal: 12, maxWidth: 560, width: 'auto' }, footer: { paddingHorizontal: 12, paddingVertical: 6, gap: 6, backgroundColor: '#172A2D' },
  event: { color: '#D8E4DB', fontSize: 12, textAlign: 'center', minHeight: 18 }, error: { color: '#FFC09E', fontSize: 12 }, text: { color: '#B2C4B8', fontSize: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' }, grow: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000B', paddingHorizontal: 16 }, panel: { width: '100%', maxWidth: 480, backgroundColor: '#172A2D', padding: 12, borderRadius: 18, gap: 10 },
  preset: { flex: 1, minHeight: 44, backgroundColor: '#34483E', borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, input: { backgroundColor: '#101C18', color: '#FAF6E9', padding: 10, borderRadius: 8, fontSize: 18, minHeight: 44, borderColor: '#647565', borderWidth: 1 }, result: { color: '#E8DBB9', fontSize: 13, lineHeight: 20 },
});
