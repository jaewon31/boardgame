import type { RoomPhase } from '../services/roomView';
import { DEFAULT_SETTINGS, type RoomSettings } from '@boardgame/shared';
import { RoomSettingsEditor, settingsLabel } from '../components/RoomSettingsEditor';
import type { EntryRequest, GameId, LobbyRoom } from '@boardgame/shared';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';

interface Props { phase: RoomPhase; notice?: 'room-closed' | 'membership-ended'; onDismissNotice?: () => void; activeRoom?: LobbyRoom | null; playerId?: string | null; onReturn?: () => void; onLeave?: () => void; onRetry?: () => void; connected?: boolean; onFriends?: () => void; accountName?: string; onAccount?: () => void; invite?: { code: string }; onEnter: (request: EntryRequest) => void; busy: boolean; error: string | null; onCancel?: () => void }

export default function HomeScreen({ phase, notice, onDismissNotice, activeRoom, playerId, onReturn, onLeave, onRetry, connected, onEnter, busy, error, onCancel, invite, accountName, onAccount, onFriends }: Props) {
  const [settings, setSettings] = useState<RoomSettings>({...DEFAULT_SETTINGS});
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (invite) { setCode(invite.code); setMode('join'); setValidation(null); } }, [invite]);
  const [game, setGame] = useState<GameId>('holdem');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [nickname, setNickname] = useState('');
  useEffect(()=>{if(accountName)setNickname(accountName);},[accountName]);
  const [code, setCode] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const [availableHeight, setAvailableHeight] = useState(0);
  const compact = availableHeight < 540;
  const tight = availableHeight < 380;
  function submit() {
    if (busy) return;
    if (activeRoom) { onReturn?.(); return; }
    const name = nickname.trim().normalize('NFC');
    if ([...name].length < 1 || [...name].length > 12 || /[\p{Cc}\p{Cf}]/u.test(name)) {
      setValidation('닉네임은 공백만 입력하지 말고 1~12자로 입력해 주세요.'); return;
    }
    if (mode === 'join' && !/^[A-Z2-9]{8}$/.test(code.trim().toUpperCase())) {
      setValidation('친구에게 받은 8자리 초대 코드를 입력해 주세요.'); return;
    }
    setValidation(null);
    Keyboard.dismiss();
    onEnter(mode === 'create' ? { type: 'create', nickname: name, game, settings } : { type: 'join', nickname: name, code: code.trim().toUpperCase() });
  }
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View onLayout={e => setAvailableHeight(e.nativeEvent.layout.height - insets.top - insets.bottom)} style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        {!tight && <View style={styles.header}><Text style={styles.brand}>FRIENDS TABLE</Text>{accountName&&<Pressable accessibilityRole="button" disabled={busy} onPress={onFriends} style={{minHeight:44,justifyContent:'center',paddingHorizontal:6}}><Text style={styles.badge}>친구</Text></Pressable>}<Pressable accessibilityRole="button" disabled={busy} onPress={onAccount} style={{minHeight:44,justifyContent:'center'}}><Text style={styles.badge}>{accountName ? '내 프로필' : '로그인'}</Text></Pressable></View>}

        {availableHeight >= 620 && <Text style={styles.title}>친구들 모이면,{ '\n' }여기가 테이블.</Text>}
        {availableHeight >= 780 && <View style={styles.hero}><Text style={styles.suits}>♠  ♥  ♣  ♦</Text><Text style={styles.heroCaption}>GOOD FRIENDS. GREAT HANDS.</Text></View>}
        {activeRoom ? <View style={styles.activeRoom}>
          <Text style={styles.selection}>참여 중인 방 · {activeRoom.hostId === playerId ? '방장' : '참여자'}</Text>
          <Text style={styles.gameName}>{activeRoom.game === 'holdem' ? '텍사스 홀덤' : '섯다'} · {activeRoom.code}</Text>
          <Text style={styles.label}>참여 인원: {activeRoom.players.length}/{activeRoom.maxPlayers}명</Text>
          <Text style={styles.selection}>{settingsLabel(activeRoom.settings ?? DEFAULT_SETTINGS)}</Text>
          {!connected && <Text style={styles.hint}>연결 확인 중 · 마지막으로 확인한 방 정보입니다.</Text>}
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <ActionButton compact title="참여 중인 방으로 돌아가기" onPress={()=>onReturn?.()} />
          <ActionButton compact secondary title="방 나가기" disabled={!connected} onPress={()=>onLeave?.()} />
          {!connected && <ActionButton compact secondary title="연결 재시도" onPress={()=>onRetry?.()} />}
        </View> : notice ? <View style={styles.activeRoom}>
          <Text accessibilityRole="alert" style={styles.label}>{notice === 'room-closed' ? '참여 중이던 방이 종료되었어요.' : '이전 방의 참여 유예시간이 끝났거나 참여가 종료되었어요.'}</Text>
          <ActionButton compact title="홈으로 이동" onPress={()=>onDismissNotice?.()} />
        </View> : phase !== 'NO_ROOM' ? <View style={styles.activeRoom}>
          <Text accessibilityRole="alert" style={styles.label}>{phase === 'CHECKING_ROOM' ? '참여 중인 방을 확인하고 있어요.' : '방 정보를 확인하지 못했어요.'}</Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <ActionButton compact secondary title="다시 시도" disabled={phase === 'CHECKING_ROOM' || phase === 'RECONNECTING'} onPress={()=>onRetry?.()} />
          {busy && onCancel && <ActionButton compact secondary title="연결 취소" onPress={onCancel} />}
        </View> : <>
        <View accessibilityRole="tablist" style={styles.tabs}>
          {([{ id: 'create', label: '새 방 만들기' }, { id: 'join', label: '코드로 입장' }] as const).map(tab => (
            <Pressable key={tab.id} disabled={busy} accessibilityRole="tab" accessibilityState={{ selected: mode === tab.id }}
              onPress={() => { setMode(tab.id); setValidation(null); }} style={[styles.tab, mode === tab.id && styles.activeTab]}>
              <Text style={[styles.tabText, mode === tab.id && styles.activeTabText]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
        {!accountName && !tight && <Text style={styles.label}>친구들에게 보일 닉네임</Text>}
        {accountName ? <View style={styles.identity}><Text style={styles.identityName}>{accountName}님, 반가워요.</Text><Text style={styles.hint}>방을 만들거나 친구의 초대 코드로 입장하세요.</Text></View> : <TextInput accessibilityLabel="닉네임" value={nickname} onChangeText={text => { setNickname(text); setValidation(null); }} editable={!busy}
          placeholder="닉네임 1~12자" placeholderTextColor="#7F9287" maxLength={24} autoCorrect={false} autoCapitalize="none"
          style={styles.input} returnKeyType="done" onSubmitEditing={submit} />}
        {mode === 'create' ? <>

          <View style={styles.gameRow}>
            {([{ id: 'holdem', symbol: '♠', name: '텍사스 홀덤' }] as const).map(item => (
              <Pressable key={item.id} disabled={busy} onPress={() => setGame(item.id)} accessibilityRole="radio" accessibilityState={{ checked: game === item.id }} style={[styles.game, tight && { minHeight: 44, justifyContent: 'center' }, game === item.id && styles.selectedGame]}>
                <Text style={styles.gameName}>{item.symbol} {item.name}</Text>

              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" disabled={busy} onPress={()=>{Keyboard.dismiss();setEditing(true);}} style={styles.settings}><Text style={styles.selection}>방 설정 ›  {settingsLabel(settings)}</Text></Pressable>
        </> : <>
          {!tight && <Text style={styles.label}>초대 코드</Text>}
          <TextInput accessibilityLabel="초대 코드" value={code} onChangeText={text => { setCode(text.toUpperCase().replace(/\s/g, '')); setValidation(null); }}
            editable={!busy} placeholder="예: AB3D5FGH" placeholderTextColor="#7F9287" maxLength={8} autoCapitalize="characters" autoCorrect={false}
            style={[styles.input, styles.codeInput]} returnKeyType="go" onSubmitEditing={submit} />

        </>}
        {(validation || error) && <Text accessibilityRole="alert" style={styles.error}>{validation || error}</Text>}
        <ActionButton compact title={mode === 'create' ? '우리 방 만들기' : '친구 방 입장하기'} onPress={submit} busy={busy} />
        {busy && onCancel && <ActionButton compact title="연결 취소" secondary onPress={onCancel} />}
        {busy && !tight && <Text style={styles.hint}>방에 연결하고 있어요…</Text>}
        {error && !busy && onRetry && <ActionButton compact secondary title="참여 상태 다시 확인" onPress={onRetry} />}
        </>}
        {!compact && <Text style={styles.footer}>친구 2~6명이 모이면 홀덤을 시작할 수 있어요.{ '\n' }가상 칩으로 즐기는 친구 전용 게임입니다.</Text>}
      </View>
      {editing && <RoomSettingsEditor initial={settings} onClose={()=>setEditing(false)} onSave={value=>{setSettings(value);setEditing(false);}} />}
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  activeRoom:{padding:18,gap:12,borderRadius:20,backgroundColor:'#24392C',borderWidth:1,borderColor:'#D5BD7F'},
  identity:{paddingVertical:8,gap:4},identityName:{color:'#FAF6E9',fontSize:18,fontWeight:'700'},
  settings: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  container: { flex: 1, backgroundColor: '#101C18' },
  content: { flex: 1, gap: 6, justifyContent: 'center', paddingHorizontal: 20, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  brand: { color: '#F2E8CE', fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  badge: { color: '#C3CEBF', backgroundColor: '#26372E', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, fontSize: 11 },
  eyebrow: { color: '#C2B583', fontSize: 12, marginBottom: 10 },
  title: { color: '#FAF6E9', fontSize: 24, fontWeight: '800', lineHeight: 30, letterSpacing: -1 },
  hero: { backgroundColor: '#1D3A2D', borderRadius: 50, padding: 16, alignItems: 'center', marginVertical: 10, borderWidth: 1, borderColor: '#3C5841' },
  suits: { color: '#DDC88F', fontSize: 28, letterSpacing: 5 },
  heroCaption: { color: '#A1B39C', fontSize: 9, letterSpacing: 2, marginTop: 7 },
  tabs: { flexDirection: 'row', backgroundColor: '#1B2B22', borderRadius: 14, padding: 4, marginBottom: 6 },
  tab: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 11 },
  activeTab: { backgroundColor: '#3A4A35' },
  tabText: { color: '#A8B6AD', fontSize: 14, fontWeight: '600' },
  activeTabText: { color: '#F5EBD1' },
  label: { color: '#DEDCCB', fontSize: 13, fontWeight: '600', marginTop: 2, marginBottom: 2 },
  input: { color: '#FAF6E9', backgroundColor: '#1B2B22', borderWidth: 1, borderColor: '#435548', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 8, minHeight: 44, fontSize: 16 },
  codeInput: { letterSpacing: 3 },
  gameRow: { flexDirection: 'row', gap: 12 },
  game: { flex: 1, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: '#34453B', backgroundColor: '#19271F' },
  selectedGame: { borderColor: '#D5BD7F', backgroundColor: '#29382A' },
  gameSymbol: { color: '#D5BD7F', fontSize: 25, marginBottom: 8 },
  gameName: { color: '#FAF6E9', fontSize: 15, fontWeight: '700' },
  selection: { color: '#D5BD7F', fontSize: 11, marginTop: 4 },
  hint: { color: '#A8B6AD', fontSize: 11, lineHeight: 18, marginVertical: 14 },
  error: { color: '#FFC09E', fontSize: 13, lineHeight: 21, marginBottom: 2 },
  footer: { textAlign: 'center', color: '#93A498', fontSize: 11, lineHeight: 18, marginTop: 6 },
});
