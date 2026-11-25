import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LobbyRoom } from '@boardgame/shared';
import { ActionButton } from './ActionButton';

interface Props {
  room: LobbyRoom;
  playerId: string | null;
  connected: boolean;
  /** Game screen: smaller tiles and at most one host request row. */
  compact?: boolean;
  onRequest: (seat: number) => void;
  onCancel: () => void;
  onResolve: (requestId: string, approve: boolean) => void;
  /** Leave the seat (spectate). Applied by the server after the current hand; chips are kept. */
  onStandUp?: () => void;
  /** Extra control shown in the same row as the stand-up button (e.g. the chip request button). */
  accessory?: ReactNode;
}

/** Older servers send no seat field: treat every listed player as seated in list order. */
export function seatsOf(room: LobbyRoom) {
  const legacy = room.players.every(p => p.seat === undefined);
  return Array.from({ length: room.maxPlayers }, (_, seat) => {
    const player = legacy ? room.players[seat] : room.players.find(p => p.seat === seat);
    const request = room.seatRequests?.find(r => r.seat === seat);
    return { seat, player, request };
  });
}
export const mySeat = (room: LobbyRoom, playerId: string | null) => {
  const me = room.players.find(p => p.id === playerId);
  return me?.seat === undefined ? (me ? room.players.indexOf(me) : null) : me.seat;
};

/** Servers that hold seats/keep chips send `standingUp`; older ones don't support standing up. */
export const canStandUp = (room: LobbyRoom, playerId: string | null) => {
  const me = room.players.find(p => p.id === playerId);
  return !!me && me.seat !== null && me.seat !== undefined && me.standingUp !== undefined;
};
/** Game screen strip: spectators, a seated player (stand-up control), or the host while requests wait. */
export const showGameSeatPanel = (room: LobbyRoom, playerId: string | null) =>
  mySeat(room, playerId) === null || canStandUp(room, playerId) || (room.hostId === playerId && (room.seatRequests?.length ?? 0) > 0)
  || room.rebuyRequests !== undefined; // rebuy-capable server: everyone gets the chip request control
const chips = (n: number | undefined) => n === undefined ? '' : `보유 ${n.toLocaleString()}칩`;

// Six fixed seats (1–6). The server alone assigns seats; buttons only send requests.
export function SeatPanel({ room, playerId, connected, compact, onRequest, onCancel, onResolve, onStandUp, accessory }: Props) {
  const host = room.hostId === playerId;
  const seat = mySeat(room, playerId);
  const me = room.players.find(p => p.id === playerId);
  const mine = room.seatRequests?.find(r => r.playerId === playerId);
  const others = (room.seatRequests ?? []).filter(r => r.playerId !== playerId);
  const notice = room.seatNotice;
  const inHand = !!room.holdem && room.holdem.street !== 'complete';
  const canPick = connected && seat === null && !mine;
  const unseated = room.players.filter(p => p.seat === null);
  // In the game strip a seated host only needs the approve/reject rows, not the seat grid.
  const showSeats = !compact || seat === null;
  const balance = me?.stack !== undefined ? `${chips(me.stack)} · ` : '';
  // Seated but not dealt into the running hand (approved mid-hand, or came back after the deal).
  const waitingNextHand = seat !== null && inHand && !!room.holdem && !room.holdem.players.some(p => p.id === playerId);
  const restore = room.seatRestore;
  const status = seat !== null ? (me?.standingUp ? `이번 판이 끝나면 자리에서 일어나요. ${chips(me.stack)}은 그대로 보관돼요.`
      : restore ? `연결이 복구됐어요. ${restore.seat + 1}번 자리와 ${chips(restore.stack)}을 그대로 이어가요.`
      : waitingNextHand ? `${seat + 1}번 자리에 앉았어요. 다음 판부터 카드를 받아요.` : null)
    : mine ? balance + `${mine.seat + 1}번 자리 · 방장 승인 대기 중${inHand ? ' · 승인되면 다음 판부터 참여' : ''}`
    : notice && !notice.approved ? balance + `방장이 ${notice.seat + 1}번 자리 요청을 거절했어요. 다른 자리를 선택하거나 다시 요청해 주세요.`
    : host ? `${balance}빈자리를 누르면 바로 앉아요.` : `${balance}빈자리를 눌러 방장에게 착석을 요청하세요.${inHand ? ' 다음 판부터 참여해요.' : ''}`;
  return <View testID="seat-panel" style={styles.panel}>
    {showSeats && <View style={styles.grid}>{seatsOf(room).map(({ seat: index, player, request }) => {
      const empty = !player && !request;
      const label = player ? `${player.nickname}${player.id === playerId ? ' (나)' : ''}` : request ? `${request.nickname} 요청 중` : '빈자리';
      const presence = player?.standingUp ? (player.connected ? '이번 판 후 일어남' : '이번 판 후 자리 해제')
        : player && !player.connected ? (player.seatHeldUntil ? '연결 끊김 · 자리 보존 중' : '재접속 대기 중') : '착석';
      const detail = player ? `${room.hostId === player.id ? '방장 · ' : ''}${presence}` : request ? '승인 대기' : canPick ? (host ? '눌러서 앉기' : '눌러서 착석 요청') : '';
      return <Pressable key={index} android_disableSound accessibilityRole="button" accessibilityLabel={`${index + 1}번 자리 ${label}`}
        accessibilityState={{ disabled: !(empty && canPick) }} disabled={!(empty && canPick)} onPress={() => onRequest(index)}
        style={[styles.seat, compact && styles.compactSeat, empty && canPick && styles.open, request && styles.reserved, player?.id === playerId && styles.me]}>
        <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
        <View style={styles.info}><Text numberOfLines={1} style={[styles.name, empty && styles.muted]}>{label}</Text>{!compact && !!detail && <Text numberOfLines={1} style={styles.detail}>{detail}</Text>}</View>
      </Pressable>;
    })}</View>}
    {!!status && <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>}
    {mine && <ActionButton compact secondary title="착석 요청 취소" disabled={!connected} onPress={onCancel} />}
    {((onStandUp && canStandUp(room, playerId) && !me?.standingUp) || accessory) && <View style={styles.actions}>
      {onStandUp && canStandUp(room, playerId) && !me?.standingUp && <View style={styles.grow}><ActionButton compact secondary title="자리에서 일어나기" disabled={!connected} onPress={onStandUp} /></View>}
      {accessory && <View style={styles.grow}>{accessory}</View>}
    </View>}
    {!compact && unseated.length > 0 && <Text style={styles.detail}>자리 선택 전: {unseated.map(p => p.nickname).join(', ')}</Text>}
    {host && (compact ? others.slice(0, 1) : others).map(r => <View key={r.id} testID="seat-request" style={styles.request}>
      <Text numberOfLines={2} style={styles.requestText}>{r.nickname} · {r.seat + 1}번 자리{r.kind === 'resit' ? ' · 재착석' : ''} · 보유 {r.stack.toLocaleString()}칩{compact && others.length > 1 ? ` · 외 ${others.length - 1}건` : ''}</Text>
      <View style={styles.actions}>
        <View style={styles.grow}><ActionButton compact secondary title="거절" disabled={!connected} onPress={() => onResolve(r.id, false)} /></View>
        <View style={styles.grow}><ActionButton compact title="승인" disabled={!connected} onPress={() => onResolve(r.id, true)} /></View>
      </View>
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seat: { width: '48%', flexGrow: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A2B22', padding: 8, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  compactSeat: { width: '30%', padding: 6 },
  open: { borderColor: '#8C815C', borderStyle: 'dashed' },
  reserved: { borderColor: '#49614B' },
  me: { borderColor: '#DDC88F' },
  number: { backgroundColor: '#344B37', height: 24, width: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: '#DFCCA0', fontWeight: '700' },
  info: { flex: 1, marginHorizontal: 6 },
  name: { color: '#FAF6E9', fontSize: 12, fontWeight: '600' },
  muted: { color: '#A8B6AD', fontWeight: '400' },
  detail: { color: '#A8B6AD', fontSize: 11, marginTop: 3 },
  status: { color: '#D5BD7F', fontSize: 12, lineHeight: 18 },
  request: { backgroundColor: '#24392C', borderRadius: 14, padding: 8, gap: 6 },
  requestText: { color: '#FAF6E9', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
});
