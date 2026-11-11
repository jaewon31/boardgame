import { SoundSettings } from '../components/SoundSettings';
import type { GameAudio } from '../hooks/useGameAudio';
import { HandReviewButton } from '../components/HandReview';
import { bettingPresets, chipLabel } from '../services/betting';
import { DEFAULT_SETTINGS } from '@boardgame/shared';
import { RoomRecords } from '../components/RoomRecords';
import { RiverSqueeze } from '../components/RiverSqueeze';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LobbyRoom, PokerAction } from '@boardgame/shared';
import { PokerTable } from '../components/PokerTable';
import { ActionButton } from '../components/ActionButton';

interface Props {
  audio: GameAudio;
  room: LobbyRoom; playerId: string | null; connected: boolean; error: string | null;
  onRevealRiver: (handId: string) => void;
  onLeave: () => void; onReset: () => void; onReveal: (handId: string) => void;
  onAct: (action: PokerAction, amount?: number) => void;
}
const streets = { preflop: '프리플롭', flop: '플롭', turn: '턴', river: '리버', complete: '결과' };
export function GameScreen({ audio, room, playerId, connected, error, onLeave, onReset, onAct, onReveal, onRevealRiver }: Props) {
  const hand = room.holdem!;
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [now, setNow] = useState(Date.now());
  const [amount, setAmount] = useState('');
  const [panel, setPanel] = useState<'raise' | 'result' | null>(null);
  const [page, setPage] = useState(0);
  const [inBB, setInBB] = useState(false);
  const chips = (value: number) => chipLabel(value, hand.bigBlind, inBB);
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
    <View style={styles.header}><View><Text style={styles.meta}>{room.code} · {hand.smallBlind}/{hand.bigBlind}</Text><Text style={styles.title}>홀덤 #{hand.number} · {streets[hand.street]}</Text></View><RoomRecords room={room} /><Pressable android_disableSound accessibilityRole="button" onPress={leave} style={styles.link}><Text style={styles.text}>나가기 ↗</Text></Pressable></View>
    <View style={styles.ribbon}><Text numberOfLines={1} style={[styles.gold, { flex: 1 }]}>{status}</Text><SoundSettings audio={audio} /><Pressable android_disableSound accessibilityRole="button" accessibilityLabel="칩과 BB 표시 전환" onPress={() => setInBB(value => !value)} style={styles.unit}><Text style={styles.gold}>{inBB ? 'BB' : '칩'} ⇄</Text></Pressable></View>
    <View style={styles.table} onLayout={e => setSize(e.nativeEvent.layout)}>
      {size.width > 0 && size.height > 0 && <PokerTable presentation={audio.presentation} room={room} playerId={playerId} width={size.width} height={size.height} seconds={seconds} inBB={inBB} connected={connected} onReveal={onReveal} />}
    </View>
    <View style={styles.footer}>
      {!!error && <Pressable android_disableSound accessibilityRole="button" accessibilityLabel="오류 자세히 보기" onPress={() => Alert.alert('게임 오류', error)}><Text accessibilityLiveRegion="polite" numberOfLines={2} style={styles.error}>{error}</Text></Pressable>}
      {legal ? <>
        <View style={styles.row}>
          <Pressable android_disableSound accessibilityRole="button" disabled={!connected} style={[styles.action, styles.foldAction, !connected && styles.disabled]} onPress={() => onAct('fold')}><Text style={styles.actionText}>폴드</Text></Pressable>
          <Pressable android_disableSound accessibilityRole="button" disabled={!connected} style={[styles.action, styles.callAction, !connected && styles.disabled]} onPress={() => onAct(legal.canCheck ? 'check' : 'call')}><Text style={styles.actionText}>{legal.canCheck ? '체크' : '콜'}</Text>{!legal.canCheck && <Text style={styles.actionAmount}>{chips(legal.callAmount)}</Text>}</Pressable>
          <Pressable android_disableSound accessibilityRole="button" accessibilityLabel="레이즈 금액 선택" disabled={!connected || (!legal.canRaise && !legal.canAllIn)} style={[styles.action, styles.raiseAction, (!connected || (!legal.canRaise && !legal.canAllIn)) && styles.disabled]} onPress={() => setPanel('raise')}><Text style={[styles.actionText, styles.raiseText]}>레이즈</Text></Pressable>
        </View>
      </> : done ? <>
        <Text numberOfLines={1} style={styles.text}>{ended ? '칩이 남은 플레이어가 승리했어요.' : me?.stack === 0 ? '칩을 모두 잃었어요. 다음 판부터 관전합니다.' : hand.canReveal ? '내 패 공개는 선택 · 공개 버튼으로 친구에게 보여주세요.' : '칩이 남은 플레이어끼리 자동으로 계속해요.'}</Text>
        <View style={styles.row}><View style={styles.grow}><HandReviewButton room={room} /></View>{ended && room.hostId === playerId && <View style={styles.grow}><ActionButton compact title="새 경기 준비" disabled={!connected} onPress={() => Alert.alert('새 경기를 준비할까요?', `모두 ${(room.settings ?? DEFAULT_SETTINGS).startingChips.toLocaleString()}칩으로 대기실에 돌아갑니다. 오늘 기록은 유지됩니다.`, [{ text: '취소', style: 'cancel' }, { text: '준비', onPress: onReset }])} /></View>}</View>
      </> : null}
    </View>
    {runout?.phase === 'squeezing' && runout.playerId === playerId && runout.card && <RiverSqueeze key={hand.id} card={runout.card} deadline={runout.deadline} connected={connected} onReveal={() => onRevealRiver(hand.id)} />}
    <Modal visible={panel !== null} transparent animationType="fade" onRequestClose={() => setPanel(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.panel}>
          <View style={styles.row}><Text style={styles.title}>{panel === 'raise' ? '베팅 금액' : '이번 판 결과'}</Text><Pressable android_disableSound accessibilityRole="button" onPress={() => setPanel(null)} style={styles.link}><Text style={styles.gold}>닫기 ✕</Text></Pressable></View>
          {panel === 'raise' && legal && <>
            <View style={styles.row}>{bettingPresets(hand, me?.roundBet ?? 0).map(({ value, label }, i) => <Pressable android_disableSound key={i} accessibilityRole="button" accessibilityState={{ selected: amount === String(value) }} onPress={() => setAmount(String(value))} style={[styles.preset, amount === String(value) && styles.selected]}><Text style={styles.text}>{label}</Text><Text style={styles.gold}>{chips(value)}</Text></Pressable>)}</View>
            <TextInput accessibilityLabel="레이즈 총 금액" accessibilityHint={`칩 단위, 최소 ${legal.minRaiseTo}, 최대 ${legal.maxRaiseTo}`} value={amount} onChangeText={setAmount} keyboardType="number-pad" maxLength={9} style={styles.input} />
            <Pressable android_disableSound accessibilityRole="button" disabled={!connected || !legal.canRaise || !validRaise} style={[styles.panelAction, styles.raiseAction, (!connected || !legal.canRaise || !validRaise) && styles.disabled]} onPress={() => { setPanel(null); onAct('raise', raiseTo); }}><Text style={[styles.actionText, styles.raiseText]}>레이즈</Text></Pressable>
            <Pressable android_disableSound accessibilityRole="button" disabled={!connected || !legal.canAllIn} style={[styles.panelAction, styles.allInAction, (!connected || !legal.canAllIn) && styles.disabled]} onPress={() => Alert.alert('올인할까요?', '남은 칩을 모두 베팅합니다.', [{ text: '취소', style: 'cancel' }, { text: '올인', style: 'destructive', onPress: () => { setPanel(null); onAct('allIn'); } }])}><Text style={styles.allInText}>올인</Text></Pressable>
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
  action: { flex: 1, height: 54, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  foldAction: { backgroundColor: '#172822' }, callAction: { backgroundColor: '#1C352C' }, raiseAction: { backgroundColor: '#D6FF94' },
  actionText: { color: '#F3F7F2', fontSize: 15, fontWeight: '700' }, raiseText: { color: '#14251B' }, actionAmount: { color: '#BDD0C6', fontSize: 11, marginTop: 2 },
  panelAction: { minHeight: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  allInAction: { marginTop: 14, backgroundColor: '#492324' }, allInText: { color: '#FF9C9C', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: .4 }, screen: { flex: 1, backgroundColor: '#07130F' }, unit: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }, selected: { backgroundColor: '#3C5946' }, header: { paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meta: { color: '#9CB6A9', fontSize: 10 }, title: { color: '#F3F7F2', fontSize: 15, fontWeight: '700' }, link: { padding: 12, minHeight: 44, justifyContent: 'center' },
  ribbon: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }, gold: { color: '#D6FF94', fontSize: 13, fontWeight: '700' },
  table: { flex: 1, minHeight: 0, marginHorizontal: 12, maxWidth: 560, width: 'auto' }, footer: { minHeight: 72, paddingHorizontal: 12, paddingVertical: 9, gap: 8 },
  error: { color: '#FFB4AA', fontSize: 12 }, text: { color: '#B2C4B8', fontSize: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' }, grow: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000B', paddingHorizontal: 16 }, panel: { width: '100%', maxWidth: 480, backgroundColor: '#14271F', padding: 16, borderRadius: 22, gap: 10 },
  preset: { flex: 1, minHeight: 44, backgroundColor: '#263D32', borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, input: { backgroundColor: '#091B12', color: '#F3F7F2', padding: 12, borderRadius: 10, fontSize: 18, minHeight: 48 }, result: { color: '#DCE9DF', fontSize: 13, lineHeight: 20 },
});
