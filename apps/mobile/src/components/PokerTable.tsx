import type { CardPresentationState, CardMotion } from '../services/cardPresentation';
import { WinnerGlow } from './WinnerGlow';
import { chipLabel } from '../services/betting';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HandPlayer, HoldemView, LobbyRoom } from '@boardgame/shared';
import { PlayingCard } from './PokerCards';

function Seat({ player, hand, room, seconds, inBB, holeMotion, hideHole }: { hideHole?: boolean; holeMotion?: CardMotion; inBB: boolean; player: HandPlayer; hand: HoldemView; room: LobbyRoom; seconds: number }) {
  const active = player.id === hand.actorId;
  const winner = hand.payouts.some(p => p.playerId === player.id && p.amount > 0);
  const connected = room.players.some(p => p.id === player.id && p.connected);
  return <View style={[styles.seat, player.folded && styles.folded]}>
    {winner && <WinnerGlow key={hand.id} />}
    <View style={styles.seatHead}><Text style={[styles.avatar, active && styles.active, winner && styles.winner]}>{player.nickname.slice(0, 1).toUpperCase()}</Text><View style={styles.seatInfo}><Text numberOfLines={1} style={styles.name}>{player.nickname}</Text><Text style={styles.stack}>{chipLabel(player.stack, hand.bigBlind, inBB)}</Text></View></View>
    <View style={styles.cards}>{[0, 1].map(i => <PlayingCard key={i} card={hideHole ? undefined : player.cards?.[i]} width={24} motion={holeMotion} />)}</View>
    <Text numberOfLines={1} style={[styles.seatStatus, winner && styles.winnerLabel]}>{winner ? '★ WINNER' : player.folded ? '폴드' : !connected ? '연결 끊김' : active ? `${seconds}초 · 생각 중` : player.allIn ? 'ALL IN' : '대기'}</Text>
    <View style={styles.badges}>{player.id === hand.dealerId && <Text style={styles.badge}>D</Text>}{player.id === hand.smallBlindId && <Text style={styles.badge}>SB</Text>}{player.id === hand.bigBlindId && <Text style={styles.badge}>BB</Text>}</View>
    {active && <View style={styles.track}><View style={[styles.timer, { width: `${Math.min(100, seconds / (room.settings?.turnSeconds ?? 30) * 100)}%` }]} /></View>}
  </View>;
}
const positions = (count: number): [number, number][] => {
  switch (count) {
    case 1: return [[.5, 0]];
    case 2: return [[0, 0], [1, 0]];
    case 3: return [[0, 1], [.5, 0], [1, 1]];
    case 4: return [[0, 1], [0, 0], [1, 0], [1, 1]];
    default: return [[0, 1], [0, 0], [.5, 0], [1, 0], [1, 1]];
  }
};
export function PokerTable({ room, playerId, seconds, inBB = false, connected, onReveal, width, height, presentation }: {
  presentation?: CardPresentationState; room: LobbyRoom; playerId: string | null; seconds: number; inBB?: boolean; connected: boolean; width: number; height: number;
  onReveal: (handId: string) => void;
}) {
  const hand = room.holdem!;
  const visual = presentation?.handId === hand.id ? presentation : undefined;
  const index = hand.players.findIndex(p => p.id === playerId);
  const me = hand.players[index];
  const winners = hand.payouts.filter(p => p.amount > 0);
  const myWin = winners.find(p => p.playerId === playerId);
  const winnerNames = winners.map(p => hand.players.find(player => player.id === p.playerId)?.nickname ?? '플레이어').join(' · ');
  // Preserve clockwise server seat order while rotating the local player to the bottom.
  const ordered = index >= 0 ? [...hand.players.slice(index + 1), ...hand.players.slice(0, index)] : hand.players;
  const slots = positions(ordered.length);
  const heroHeight = me ? (hand.canReveal ? 140 : 116) : 0;
  const fieldHeight = height - heroHeight;
  const compact = fieldHeight < 290;
  const seatWidth = width < 350 ? 76 : 86;
  const cardWidth = Math.max(19, Math.min(44, (width - 54) / 5));
  return <View style={[styles.arena, { height, width }]}>
    <View style={[styles.rail, { bottom: heroHeight + 10, top: 30 }]}><View style={styles.felt}><View style={styles.innerLine} /><Text style={[styles.feltBrand, compact && { opacity: 0 }]}>TEXAS HOLD’EM</Text></View></View>
    {ordered.map((p, i) => {
      // A spectator can see six seats; use the bottom seat for the sixth participant.
      const [x, y] = slots[i] ?? [.5, 1];
      return <View key={p.id} style={[styles.position, { width: seatWidth, left: x * (width - seatWidth), top: 6 + y * Math.max(0, fieldHeight - 100) }]}><Seat player={p} hand={hand} room={room} seconds={seconds} inBB={inBB} holeMotion={visual?.hole} hideHole={visual?.holePending} />{p.roundBet > 0 && <Text numberOfLines={1} style={styles.betChip}>● {chipLabel(p.roundBet, hand.bigBlind, inBB)}</Text>}</View>;
    })}
    <View style={[styles.community, { top: Math.max(100, (fieldHeight - 96) / 2), gap: compact ? 1 : 5 }]}>

      <Text style={styles.pot}>POT  {chipLabel(hand.pot, hand.bigBlind, inBB)}</Text>
      <View style={styles.board}>{Array.from({ length: 5 }, (_, i) => <PlayingCard key={`${hand.id}-${i}`} card={i < (visual?.boardCount ?? hand.board.length) ? hand.board[i] : undefined} width={cardWidth} motion={visual?.board[i]} />)}</View>
      <Text accessibilityLiveRegion="polite" numberOfLines={2} style={winners.length ? styles.winnerSummary : styles.blinds}>{winners.length ? `★ ${winnerNames} 승리` : `BLINDS ${hand.smallBlind} / ${hand.bigBlind}`}</Text>
    </View>
    {me && <View style={[styles.hero, { top: fieldHeight + 3 }]}>
      {myWin && <WinnerGlow key={hand.id} />}
      <View style={styles.heroHeader}><Text style={styles.heroName}>{me.nickname} <Text style={myWin ? styles.heroWinLabel : styles.you}>{myWin ? '★ WINNER' : 'YOU'}</Text> {me.id === hand.dealerId ? 'Ⓓ' : ''}</Text><Text style={styles.heroStack}>{chipLabel(me.stack, hand.bigBlind, inBB)}</Text></View>
      {<View style={styles.heroCards}>{[0, 1].map(i => <View key={i} style={{ transform: [{ rotate: i === 0 ? '-7deg' : '7deg' }] }}><PlayingCard card={visual?.holePending ? undefined : me.cards?.[i]} width={44} motion={visual?.hole} /></View>)}</View>}
      {hand.canReveal && <Pressable accessibilityRole="button" disabled={!connected} onPress={() => onReveal(hand.id)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.heroStatus}>내 패 모두에게 공개</Text></Pressable>}
      {!hand.canReveal && <Text style={[styles.heroStatus, myWin && styles.gold]}>{myWin ? `지급 ${chipLabel(myWin.amount, hand.bigBlind, inBB)} · ${myWin.handName}` : me.folded ? '이번 판 폴드' : hand.street === 'complete' ? me.revealed ? '모두에게 공개된 패' : '나만 볼 수 있는 패' : `${hand.actorId === me.id ? `내 차례 · ${seconds}초` : '나만 볼 수 있는 패'}  ·  베팅 ${chipLabel(me.roundBet, hand.bigBlind, inBB)}`}</Text>}
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  winnerLabel: { color: '#D6FF94', fontSize: 11, fontWeight: '700', letterSpacing: .5 },
  winnerSummary: { color: '#D6FF94', fontSize: 14, fontWeight: '700', textAlign: 'center', maxWidth: '90%' },
  heroWinLabel: { color: '#D6FF94', fontSize: 12, fontWeight: '700' },
  arena: { height: 590, position: 'relative' }, rail: { position: 'absolute', top: 58, bottom: 145, left: 23, right: 23, borderRadius: 170, padding: 6, backgroundColor: '#26423A' },
  felt: { flex: 1, borderRadius: 160, backgroundColor: '#196452', overflow: 'hidden', justifyContent: 'flex-end', alignItems: 'center' }, innerLine: { position: 'absolute', top: 16, bottom: 16, left: 12, right: 12, borderRadius: 150, borderWidth: 1, borderColor: '#347865' },
  feltBrand: { color: '#43816C', fontSize: 10, fontWeight: '500', letterSpacing: 2, textAlign: 'center', marginBottom: 90 },
  position: { position: 'absolute', zIndex: 2 }, seat: { padding: 3, gap: 3, alignItems: 'center' }, active: { backgroundColor: '#D6FF94', color: '#14251B' }, winner: { backgroundColor: '#D6FF94', color: '#14251B' }, folded: { opacity: .45 },
  seatHead: { paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 5, width: '100%' }, avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#3D665B', color: '#F3F7F2', textAlign: 'center', lineHeight: 26, fontWeight: '700' }, seatInfo: { flex: 1 }, name: { color: '#F3F7F2', fontWeight: '600', fontSize: 11 }, stack: { color: '#F3F7F2', fontSize: 11, marginTop: 2 },
  cards: { flexDirection: 'row', gap: 4 }, seatStatus: { color: '#B3CCC0', fontSize: 10 }, gold: { color: '#D6FF94', fontWeight: '700' }, badges: { position: 'absolute', right: 0, top: -9, flexDirection: 'row', gap: 4 }, badge: { color: '#D6FF94', fontSize: 9, fontWeight: '700' }, track: { height: 3, width: '100%', backgroundColor: '#254438', borderRadius: 2 }, timer: { height: 3, backgroundColor: '#D6FF94', borderRadius: 2 },
  community: { position: 'absolute', top: 200, left: 0, right: 0, alignItems: 'center', gap: 5 }, pot: { color: '#F3F7F2', fontSize: 18, fontWeight: '700' }, board: { flexDirection: 'row', gap: 4, marginVertical: 2 }, blinds: { color: '#AACDBD', fontSize: 9, letterSpacing: 1.5 },
  hero: { position: 'absolute', top: 430, left: 20, right: 20, alignItems: 'center' }, betChip: { alignSelf: 'center', color: '#E4F3E9', paddingVertical: 2, fontSize: 10 }, heroHeader: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 6 }, heroName: { color: '#F3F7F2', fontWeight: '700', fontSize: 14 }, you: { color: '#D6FF94', fontSize: 9 }, heroStack: { color: '#F3F7F2', fontWeight: '700', fontSize: 14 }, heroCards: { flexDirection: 'row', gap: 12, paddingTop: 3 }, heroStatus: { marginTop: 5, color: '#B3CCC0', fontSize: 11 },
});
