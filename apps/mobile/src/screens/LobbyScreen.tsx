import { DEFAULT_SETTINGS, type RoomSettings } from '@boardgame/shared';
import { RoomSettingsEditor, settingsLabel } from '../components/RoomSettingsEditor';
import { RoomRecords } from '../components/RoomRecords';
import { shareInvite } from '../services/shareInvite';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { LobbyRoom } from '@boardgame/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import { useState } from 'react';

interface Props {
  room: LobbyRoom;
  playerId: string | null;
  connected: boolean;
  error: string | null;
  onHome: () => void;
  onRetry: () => void;
  onLeave: () => void;
  onStart: () => void;
  onSettings: (settings: RoomSettings, revision?: number) => Promise<void>;
}
export function LobbyScreen({ room, playerId, connected, error, onHome, onRetry, onLeave, onStart, onSettings }: Props) {
  const [editing, setEditing] = useState<{settings: RoomSettings; revision: number | undefined} | null>(null);
  const settings = room.settings ?? DEFAULT_SETTINGS;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [shareError, setShareError] = useState<string | null>(null);
  async function share() {
    setShareError(null);
    try { await shareInvite(room.code); }
    catch { setShareError('공유 창을 열지 못했어요. 초대 코드를 직접 전달해 주세요.'); }
  }
  return (
    <View style={[styles.screen, styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.header}><Text style={styles.brand}>FRIENDS TABLE</Text><RoomRecords room={room} /><Text style={styles.status}>{connected ? '● 연결됨' : '○ 연결 확인 중'}</Text></View>
      <Text style={styles.eyebrow}>{room.game === 'holdem' ? '텍사스 홀덤' : '섯다'} · 비공개 대기실</Text>
      {height > 740 && <Text style={styles.title}>친구들을 기다리는 중</Text>}

      <View style={styles.invite}>
        <Text style={styles.label}>우리 방 초대 코드</Text>
        <Text selectable accessibilityLabel={`초대 코드 ${room.code}`} style={styles.code}>{room.code}</Text>
        <ActionButton compact title="초대 링크 공유" onPress={share} disabled={!connected} />
        {shareError && <Text accessibilityRole="alert" style={styles.error}>{shareError}</Text>}
      </View>
      {!connected && <ActionButton compact secondary title="연결 재시도" onPress={onRetry} />}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={styles.header}><Text style={styles.section}>참가자</Text><Text style={styles.count}>{room.players.length} / {room.maxPlayers}</Text></View>
      <View style={styles.grid}>{room.players.map((player, index) => (
        <View key={player.id} style={styles.player}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{index + 1}</Text></View>
          <View style={styles.playerInfo}><Text numberOfLines={1} style={styles.name}>{player.nickname}{player.id === playerId ? ' (나)' : ''}</Text><Text style={styles.playerStatus}>{player.connected ? '입장 완료' : '재접속 대기 중'}</Text></View>
          {room.hostId === player.id && <Text style={styles.host}>방장</Text>}
        </View>
      ))}</View>
      <View style={styles.note}><Text style={styles.noteText}>{room.game === 'holdem' ? settingsLabel(settings) + ' · 첫 판 이후 자동 진행' : '섯다 게임은 준비 중이에요.'}</Text></View>
      {room.hostId === playerId && <Pressable accessibilityRole="button" disabled={!connected} onPress={()=>setEditing({settings: {...settings}, revision: room.settingsRevision})} style={{minHeight:44,justifyContent:'center'}}><Text style={styles.host}>방 설정 변경 ›</Text></Pressable>}
      {editing && room.hostId === playerId && <RoomSettingsEditor initial={editing.settings} onClose={()=>setEditing(null)} onSave={value=>onSettings(value, editing.revision)} />}
      <ActionButton compact secondary title="홈으로 · 방 참여 유지" onPress={onHome} />
      <View style={{ flexDirection: 'row', gap: 8 }}>{room.game === 'holdem' && room.hostId === playerId && <View style={{ flex: 1 }}><ActionButton compact title="홀덤 시작" onPress={onStart} disabled={!connected || room.players.filter(p => p.connected).length < 2} /></View>}
      <View style={{ flex: 1 }}><ActionButton compact title="방 나가기" onPress={onLeave} disabled={!connected} secondary /></View></View>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101C18' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  content: { gap: 6, justifyContent: 'center', paddingHorizontal: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  brand: { color: '#F2E8CE', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  status: { color: '#B1C7A5', fontSize: 11 },
  eyebrow: { color: '#D5BD7F', fontSize: 12, marginTop: 2, marginBottom: 2 },
  title: { color: '#FAF6E9', fontSize: 22, fontWeight: '800' },
  description: { color: '#A8B6AD', fontSize: 14, lineHeight: 23, marginTop: 12 },
  invite: { backgroundColor: '#24392C', padding: 10, borderRadius: 20, marginVertical: 4 },
  label: { color: '#C8D2C2', fontSize: 12, textAlign: 'center' },
  code: { color: '#F5EBD1', fontSize: 30, fontWeight: '800', letterSpacing: 4, textAlign: 'center', marginVertical: 6 },
  section: { color: '#FAF6E9', fontSize: 18, fontWeight: '700' },
  count: { color: '#D5BD7F', fontSize: 14 },
  player: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A2B22', padding: 8, borderRadius: 14, marginBottom: 0 },
  avatar: { backgroundColor: '#344B37', height: 24, width: 24, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#DFCCA0', fontWeight: '700' },
  playerInfo: { flex: 1, marginHorizontal: 6 },
  name: { color: '#FAF6E9', fontSize: 12, fontWeight: '600' },
  playerStatus: { color: '#A8B6AD', fontSize: 11, marginTop: 5 },
  host: { color: '#D5BD7F', fontSize: 11 },
  note: { paddingVertical: 4, marginBottom: 0 },
  noteText: { color: '#A8B6AD', fontSize: 12, lineHeight: 20 },
  error: { color: '#FFC09E', fontSize: 13, lineHeight: 21, marginBottom: 2 },
});
