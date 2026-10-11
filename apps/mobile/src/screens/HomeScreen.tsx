import type { EntryRequest, GameId } from '@boardgame/shared';
import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';

interface Props { onEnter: (request: EntryRequest) => void; busy: boolean; error: string | null }

export default function HomeScreen({ onEnter, busy, error }: Props) {
  const [game, setGame] = useState<GameId>('holdem');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const [availableHeight, setAvailableHeight] = useState(0);
  const compact = availableHeight < 540;
  const tight = availableHeight < 380;
  function submit() {
    const name = nickname.trim().normalize('NFC');
    if ([...name].length < 1 || [...name].length > 12 || /[\p{Cc}\p{Cf}]/u.test(name)) {
      setValidation('닉네임은 공백만 입력하지 말고 1~12자로 입력해 주세요.'); return;
    }
    if (mode === 'join' && !/^[A-Z2-9]{8}$/.test(code.trim().toUpperCase())) {
      setValidation('친구에게 받은 8자리 초대 코드를 입력해 주세요.'); return;
    }
    setValidation(null);
    Keyboard.dismiss();
    onEnter(mode === 'create' ? { type: 'create', nickname: name, game } : { type: 'join', nickname: name, code: code.trim().toUpperCase() });
  }
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View onLayout={e => setAvailableHeight(e.nativeEvent.layout.height - insets.top - insets.bottom)} style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        {!tight && <View style={styles.header}><Text style={styles.brand}>FRIENDS TABLE</Text><Text style={styles.badge}>친구 전용</Text></View>}

        {!compact && <Text style={styles.title}>친구들 모이면,{ '\n' }여기가 테이블.</Text>}
        {availableHeight >= 680 && <View style={styles.hero}><Text style={styles.suits}>♠  ♥  ♣  ♦</Text><Text style={styles.heroCaption}>GOOD FRIENDS. GREAT HANDS.</Text></View>}
        <View accessibilityRole="tablist" style={styles.tabs}>
          {([{ id: 'create', label: '새 방 만들기' }, { id: 'join', label: '코드로 입장' }] as const).map(tab => (
            <Pressable key={tab.id} disabled={busy} accessibilityRole="tab" accessibilityState={{ selected: mode === tab.id }}
              onPress={() => { setMode(tab.id); setValidation(null); }} style={[styles.tab, mode === tab.id && styles.activeTab]}>
              <Text style={[styles.tabText, mode === tab.id && styles.activeTabText]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
        {!tight && <Text style={styles.label}>친구들에게 보일 닉네임</Text>}
        <TextInput accessibilityLabel="닉네임" value={nickname} onChangeText={text => { setNickname(text); setValidation(null); }} editable={!busy}
          placeholder="닉네임 1~12자" placeholderTextColor="#7F9287" maxLength={24} autoCorrect={false} autoCapitalize="none"
          style={styles.input} returnKeyType="done" onSubmitEditing={submit} />
        {mode === 'create' ? <>
          {!tight && <Text style={styles.label}>어떤 게임을 할까요?</Text>}
          <View style={styles.gameRow}>
            {([{ id: 'holdem', symbol: '♠', name: '텍사스 홀덤' }, { id: 'seotda', symbol: '花', name: '섯다' }] as const).map(item => (
              <Pressable key={item.id} disabled={busy} onPress={() => setGame(item.id)} accessibilityRole="radio" accessibilityState={{ checked: game === item.id }} style={[styles.game, tight && { minHeight: 44, justifyContent: 'center' }, game === item.id && styles.selectedGame]}>
                <Text style={styles.gameName}>{item.symbol} {item.name}</Text>
                {!tight && <Text style={styles.selection}>{game === item.id ? '선택됨 ✓' : '선택하기'}</Text>}
              </Pressable>
            ))}
          </View>

        </> : <>
          {!tight && <Text style={styles.label}>초대 코드</Text>}
          <TextInput accessibilityLabel="초대 코드" value={code} onChangeText={text => { setCode(text.toUpperCase().replace(/\s/g, '')); setValidation(null); }}
            editable={!busy} placeholder="예: AB3D5FGH" placeholderTextColor="#7F9287" maxLength={8} autoCapitalize="characters" autoCorrect={false}
            style={[styles.input, styles.codeInput]} returnKeyType="go" onSubmitEditing={submit} />

        </>}
        {(validation || error) && <Text accessibilityRole="alert" style={styles.error}>{validation || error}</Text>}
        <ActionButton compact title={mode === 'create' ? '우리 방 만들기' : '친구 방 입장하기'} onPress={submit} busy={busy} />
        {busy && !tight && <Text style={styles.hint}>방에 연결하고 있어요…</Text>}
        {!compact && <Text style={styles.footer}>친구 2~6명이 모이면 홀덤을 시작할 수 있어요.{ '\n' }섯다는 준비 중이에요.</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
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
