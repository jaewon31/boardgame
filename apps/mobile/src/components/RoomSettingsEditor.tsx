import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { validRoomSettings, type RoomSettings } from '@boardgame/shared';
import { ActionButton } from './ActionButton';
const fields = [
  { key: 'startingChips', title: '시작 칩', note: '100~100,000 · 빅 블라인드의 10배 이상', presets: [1000, 5000, 10000] },
  { key: 'smallBlind', title: '스몰 블라인드', note: '1 이상 · 빅 블라인드보다 작게', presets: [10, 25, 50] },
  { key: 'bigBlind', title: '빅 블라인드', note: '스몰 블라인드보다 크게 · 최대 10,000', presets: [20, 50, 100] },
  { key: 'turnSeconds', title: '차례당 제한 시간', note: '10~120초 · 리버 째기 시간은 별도', presets: [15, 30, 60] },
] as const;
export function settingsLabel(s: RoomSettings) { return s.startingChips.toLocaleString() + '칩 · ' + s.smallBlind + '/' + s.bigBlind + ' · ' + s.turnSeconds + '초'; }
export function RoomSettingsEditor({ initial, onSave, onClose }: { initial: RoomSettings; onSave: (settings: RoomSettings) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState(() => Object.fromEntries(Object.entries(initial).map(([k,v]) => [k, String(v)])));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const field = fields[step];
  function save() {
    const settings = Object.fromEntries(fields.map(f => [f.key, Number(values[f.key])])) as unknown as RoomSettings;
    if (!validRoomSettings(settings)) { setError('시작 칩은 10BB 이상, BB는 SB보다 커야 해요. 입력 범위를 확인해 주세요.'); return; }
    Keyboard.dismiss(); onSave(settings);
  }
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.overlay, { paddingTop:insets.top + 8, paddingBottom:insets.bottom + 8 }]}>
      <View style={styles.panel}>
        <View style={styles.row}><Text style={styles.heading}>방 설정 · {step + 1}/4</Text><Pressable accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={styles.text}>취소 ✕</Text></Pressable></View>
        <Text style={styles.heading}>{field.title}</Text><Text style={styles.note}>{field.note}</Text>
        <TextInput key={field.key} accessibilityLabel={field.title} value={values[field.key]} onChangeText={v => { setValues(old => ({...old, [field.key]:v.replace(/[^0-9]/g,'')})); setError(''); }} keyboardType="number-pad" maxLength={6} style={styles.input} />
        <View style={styles.row}>{field.presets.map(v => <Pressable accessibilityRole="button" key={v} style={styles.preset} onPress={() => { setValues(old => ({...old,[field.key]:String(v)})); setError(''); }}><Text style={styles.text}>{v.toLocaleString()}</Text></Pressable>)}</View>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <View style={styles.row}><View style={styles.grow}><ActionButton compact secondary title="이전" disabled={step === 0} onPress={() => { Keyboard.dismiss(); setStep(s=>s-1); }} /></View><View style={styles.grow}><ActionButton compact title={step === 3 ? '설정 적용' : '다음'} onPress={() => { if(step === 3) save(); else { Keyboard.dismiss(); setStep(s=>s+1); } }} /></View></View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay:{flex:1,backgroundColor:'#000B',justifyContent:'center',alignItems:'center',paddingHorizontal:16}, panel:{width:'100%',maxWidth:480,padding:12,borderRadius:16,backgroundColor:'#172A2D',gap:6}, row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},grow:{flex:1}, heading:{color:'#FAF6E9',fontSize:17,fontWeight:'700'}, text:{color:'#DFCCA0',fontSize:13},note:{color:'#A8B6AD',fontSize:11}, close:{minHeight:44,justifyContent:'center',paddingHorizontal:8}, input:{backgroundColor:'#101C18',color:'#FAF6E9',borderRadius:8,padding:8,minHeight:44,fontSize:20}, preset:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',backgroundColor:'#34483E',borderRadius:8},error:{color:'#FFC09E',fontSize:12},
});
