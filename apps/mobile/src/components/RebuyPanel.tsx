import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_REBUY_CHIPS, rebuyLimit, DEFAULT_SETTINGS, type LobbyRoom } from '@boardgame/shared';
import { ActionButton } from './ActionButton';

// Rebuy (policy C): the player types the extra chips, the host approves or rejects.
// The server alone grants chips; these components only send requests and show server state.

const n = (value: number) => value.toLocaleString();
/** Whole positive chip count within the limit, or null. Digits only (no signs, decimals or exponents). */
export function parseRebuyAmount(text: string, limit = MAX_REBUY_CHIPS): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,10}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value > 0 && value <= Math.min(limit, MAX_REBUY_CHIPS) ? value : null;
}
/** The room's per-request limit as the server reports it (settings.maxRebuy, default = starting chips). */
export const roomRebuyLimit = (room: LobbyRoom) => rebuyLimit(room.settings ?? DEFAULT_SETTINGS);
/** Older servers send no rebuy fields: hide rebuy entirely. */
export const rebuySupported = (room: LobbyRoom) => room.rebuyRequests !== undefined;

interface FormProps { stack: number; pending: number; amount: string; connected: boolean;
  /** Per-request maximum (room setting). */ limit?: number; /** Host: granted without approval. */ host?: boolean;
  onChange: (text: string) => void; onSubmit: (amount: number) => void; onClose: () => void }
/** Request form body: current chips, requested chips, expected balance after approval. */
export function RebuyForm({ stack, pending, amount, connected, limit = MAX_REBUY_CHIPS, host, onChange, onSubmit, onClose }: FormProps) {
  const value = parseRebuyAmount(amount, limit);
  const expected = stack + pending + (value ?? 0);
  return <View testID="rebuy-form" style={styles.form}>
    <Text style={styles.title}>{host ? '칩 추가' : '칩 추가 요청'}</Text>
    <View style={styles.line}><Text style={styles.label}>보유 칩</Text><Text style={styles.value}>{n(stack)}{pending > 0 ? ` (+${n(pending)} 반영 예정)` : ''}</Text></View>
    <Text style={styles.label}>추가 요청 칩</Text>
    <TextInput accessibilityLabel="추가 요청 칩" accessibilityHint={`1부터 ${n(limit)}까지의 정수`} placeholder="예: 1000" placeholderTextColor="#7E9587"
      value={amount} onChangeText={text => onChange(text.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={10} returnKeyType="done"
      blurOnSubmit={Platform.OS === 'web' ? false : undefined} onSubmitEditing={() => { if (connected && value !== null) onSubmit(value); }} style={styles.input} />
    <Text style={styles.hint}>1회 최대 {n(limit)}칩</Text>
    {amount !== '' && value === null && <Text accessibilityRole="alert" style={styles.warn}>{/^\d+$/.test(amount) && Number(amount) > limit ? `1회 최대 ${n(limit)}칩까지 요청할 수 있어요.` : '1 이상의 정수로 입력해 주세요.'}</Text>}
    <View style={styles.line}><Text style={styles.label}>승인 후 예상 칩</Text><Text style={[styles.value, styles.gold]}>{value === null ? '-' : n(expected)}</Text></View>
    <Text style={styles.hint}>{host ? '방장은 승인 없이 바로 추가돼요.' : '방장이 승인하면 추가돼요.'} 게임 중이면 이번 판이 끝난 뒤 반영돼요.</Text>
    <View style={styles.actions}>
      <View style={styles.grow}><ActionButton compact secondary title="닫기" onPress={onClose} /></View>
      <View style={styles.grow}><ActionButton compact title={host ? '칩 추가하기' : '요청 보내기'} disabled={!connected || value === null} onPress={() => { if (value !== null) onSubmit(value); }} /></View>
    </View>
  </View>;
}

interface ButtonProps { room: LobbyRoom; playerId: string | null; connected: boolean; onRequest: (amount: number) => void }
/** Opens the request form in a modal so the keyboard never covers the table's action buttons. */
export function RebuyButton({ room, playerId, connected, onRequest }: ButtonProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const me = room.players.find(p => p.id === playerId);
  const pending = room.rebuyRequests?.some(r => r.playerId === playerId);
  if (!me || !rebuySupported(room) || pending) return null;
  return <>
    <ActionButton compact secondary title={room.hostId === playerId ? '칩 추가' : '칩 추가 요청'} disabled={!connected} onPress={() => { setAmount(''); setOpen(true); }} />
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <KeyboardAvoidingView enabled={Platform.OS !== 'web'} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <RebuyForm stack={me.stack ?? 0} pending={me.pendingChips ?? 0} amount={amount} connected={connected} onChange={setAmount}
          limit={roomRebuyLimit(room)} host={room.hostId === playerId}
          onClose={() => setOpen(false)} onSubmit={value => { setOpen(false); onRequest(value); }} />
      </KeyboardAvoidingView>
    </Modal>
  </>;
}

interface PanelProps { room: LobbyRoom; playerId: string | null; connected: boolean; compact?: boolean;
  onCancel: () => void; onResolve: (requestId: string, approve: boolean) => void }
/** Status for the viewer's own request/decision and, for the host, the approve/reject rows. Renders nothing when idle. */
export function RebuyPanel({ room, playerId, connected, compact, onCancel, onResolve }: PanelProps) {
  if (!rebuySupported(room)) return null;
  const host = room.hostId === playerId;
  const me = room.players.find(p => p.id === playerId);
  const mine = room.rebuyRequests?.find(r => r.playerId === playerId);
  const notice = room.rebuyNotice;
  const requests = host ? (room.rebuyRequests ?? []) : [];
  const shown = compact ? requests.slice(0, 1) : requests;
  const pending = me?.pendingChips ?? 0;
  const status = mine ? `칩 추가 +${n(mine.amount)} 승인 대기 중 · 승인 후 ${n(mine.expectedStack)}칩`
    : pending > 0 ? `칩 +${n(pending)} 추가 승인됨 · 이번 판이 끝나면 반영돼요`
    : notice?.approved && notice.applied ? `칩 +${n(notice.amount)} 추가 완료 · 보유 ${n(me?.stack ?? 0)}칩`
    : notice && !notice.approved && notice.reason === 'limit' ? `리바이 최대 수량이 ${n(notice.limit ?? 0)}칩으로 바뀌어 칩 추가 요청(+${n(notice.amount)})이 취소됐어요. 다시 요청해 주세요.`
    : notice && !notice.approved ? `방장이 칩 추가 요청(+${n(notice.amount)})을 거절했어요. 보유 칩은 그대로예요.`
    : null;
  if (!status && shown.length === 0) return null;
  return <View testID="rebuy-panel" style={styles.panel}>
    {!!status && <View style={styles.statusRow}>
      <Text accessibilityLiveRegion="polite" style={[styles.status, styles.grow]}>{status}</Text>
      {mine && <ActionButton compact secondary title="요청 취소" disabled={!connected} onPress={onCancel} />}
    </View>}
    {shown.map(r => <View key={r.id} testID="rebuy-request" style={styles.request}>
      <Text numberOfLines={compact ? 2 : 3} style={styles.requestText}>
        {r.nickname}{r.playerId === playerId ? ' (나)' : ''} · 칩 추가 요청{'\n'}보유 {n(r.stack)}{r.pendingChips > 0 ? ` (+${n(r.pendingChips)} 대기)` : ''} · 요청 +{n(r.amount)} · 승인 후 {n(r.expectedStack)}
        {compact && requests.length > 1 ? ` · 외 ${requests.length - 1}건` : ''}
      </Text>
      <View style={styles.actions}>
        <View style={styles.grow}><ActionButton compact secondary title="거절" disabled={!connected} onPress={() => onResolve(r.id, false)} /></View>
        <View style={styles.grow}><ActionButton compact title="칩 지급 승인" disabled={!connected} onPress={() => onResolve(r.id, true)} /></View>
      </View>
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { color: '#D5BD7F', fontSize: 12, lineHeight: 18 },
  request: { backgroundColor: '#24392C', borderRadius: 14, padding: 8, gap: 6 },
  requestText: { color: '#FAF6E9', fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000B', paddingHorizontal: 16 },
  form: { width: '100%', maxWidth: 480, backgroundColor: '#14271F', padding: 16, borderRadius: 22, gap: 10 },
  title: { color: '#FAF6E9', fontSize: 17, fontWeight: '700' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { color: '#A8B6AD', fontSize: 13 },
  value: { color: '#FAF6E9', fontSize: 15, fontWeight: '600' },
  gold: { color: '#DDC88F' },
  input: { backgroundColor: '#091B12', color: '#F3F7F2', padding: 12, borderRadius: 10, fontSize: 18, minHeight: 48 },
  warn: { color: '#F2A29A', fontSize: 12 },
  hint: { color: '#A8B6AD', fontSize: 12, lineHeight: 18 },
});
