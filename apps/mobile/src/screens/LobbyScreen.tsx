import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { LobbyRoom } from '@boardgame/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import { useState } from 'react';

interface Props {
  room: LobbyRoom;
  playerId: string | null;
  connected: boolean;
  error: string | null;
  onLeave: () => void;
  onStart: () => void;
}
export function LobbyScreen({ room, playerId, connected, error, onLeave, onStart }: Props) {
  const insets = useSafeAreaInsets();
  const [shareError, setShareError] = useState<string | null>(null);
  async function share() {
    setShareError(null);
    try { await Share.share({ message: `Friends Table에서 같이 놀아요!\n초대 코드: ${room.code}\n앱에서 '코드로 입장'을 선택해 주세요.` }); }
    catch { setShareError('공유 창을 열지 못했어요. 초대 코드를 직접 전달해 주세요.'); }
  }
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28 }]}>
      <View style={styles.header}><Text style={styles.brand}>FRIENDS TABLE</Text><Text style={styles.status}>{connected ? '● 연결됨' : '○ 연결 확인 중'}</Text></View>
      <Text style={styles.eyebrow}>{room.game === 'holdem' ? '텍사스 홀덤' : '섯다'} · 비공개 대기실</Text>
      <Text style={styles.title}>친구들을 기다리는 중</Text>
      <Text style={styles.description}>아래 코드를 친구에게 보내 주세요.{ '\n' }같은 코드를 입력하면 이 방에 모일 수 있어요.</Text>
      <View style={styles.invite}>
        <Text style={styles.label}>우리 방 초대 코드</Text>
        <Text selectable accessibilityLabel={`초대 코드 ${room.code}`} style={styles.code}>{room.code}</Text>
        <ActionButton title="친구에게 코드 공유" onPress={share} disabled={!connected} />
        {shareError && <Text accessibilityRole="alert" style={styles.error}>{shareError}</Text>}
      </View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={styles.header}><Text style={styles.section}>참가자</Text><Text style={styles.count}>{room.players.length} / {room.maxPlayers}</Text></View>
      {room.players.map((player, index) => (
        <View key={player.id} style={styles.player}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{index + 1}</Text></View>
          <View style={styles.playerInfo}><Text style={styles.name}>{player.nickname}{player.id === playerId ? ' (나)' : ''}</Text><Text style={styles.playerStatus}>{player.connected ? '입장 완료' : '재접속 대기 중'}</Text></View>
          {room.hostId === player.id && <Text style={styles.host}>방장</Text>}
        </View>
      ))}
      <View style={styles.note}><Text style={styles.noteText}>{room.game === 'holdem' ? '시작 칩 1,000 · 블라인드 10/20 · 차례당 30초. 2명 이상 접속하면 방장이 시작할 수 있어요.' : '섯다 게임은 준비 중이에요.'}</Text></View>
      {room.game === 'holdem' && room.hostId === playerId && <ActionButton title="홀덤 시작" onPress={onStart} disabled={!connected || room.players.filter(p => p.connected).length < 2} />}
      <ActionButton title="방 나가기" onPress={onLeave} secondary />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101C18' },
  content: { paddingHorizontal: 24, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  brand: { color: '#F2E8CE', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  status: { color: '#B1C7A5', fontSize: 11 },
  eyebrow: { color: '#D5BD7F', fontSize: 12, marginTop: 22, marginBottom: 12 },
  title: { color: '#FAF6E9', fontSize: 27, fontWeight: '800' },
  description: { color: '#A8B6AD', fontSize: 14, lineHeight: 23, marginTop: 12 },
  invite: { backgroundColor: '#24392C', padding: 22, borderRadius: 20, marginVertical: 28 },
  label: { color: '#C8D2C2', fontSize: 12, textAlign: 'center' },
  code: { color: '#F5EBD1', fontSize: 30, fontWeight: '800', letterSpacing: 4, textAlign: 'center', marginVertical: 18 },
  section: { color: '#FAF6E9', fontSize: 18, fontWeight: '700' },
  count: { color: '#D5BD7F', fontSize: 14 },
  player: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A2B22', padding: 15, borderRadius: 14, marginBottom: 10 },
  avatar: { backgroundColor: '#344B37', height: 42, width: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#DFCCA0', fontWeight: '700' },
  playerInfo: { flex: 1, marginHorizontal: 12 },
  name: { color: '#FAF6E9', fontSize: 15, fontWeight: '600' },
  playerStatus: { color: '#A8B6AD', fontSize: 11, marginTop: 5 },
  host: { color: '#D5BD7F', fontSize: 11 },
  note: { paddingVertical: 18, marginBottom: 10 },
  noteText: { color: '#A8B6AD', fontSize: 12, lineHeight: 20 },
  error: { color: '#FFC09E', fontSize: 13, lineHeight: 21, marginBottom: 18 },
});
