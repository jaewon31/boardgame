import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function App() {
  const [game, setGame] = useState<'holdem' | 'seotda'>('holdem');
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.brand}>FRIENDS TABLE</Text>
          <Text style={styles.badge}>개발 중</Text>
        </View>
        <Text style={styles.eyebrow}>우리끼리 즐기는 카드 한 판</Text>
        <Text style={styles.title}>친구들 모이면,{ '\n' }여기가 테이블.</Text>
        <Text style={styles.subtitle}>홀덤부터 섯다까지.{ '\n' }초대한 친구들과 함께할 우리만의 공간.</Text>

        <View style={styles.table} accessibilityLabel="카드 테이블 일러스트">
          <View style={styles.card}><Text style={styles.blackSuit}>A</Text><Text style={styles.largeSuit}>♠</Text></View>
          <View style={[styles.card, styles.secondCard]}><Text style={styles.redSuit}>A</Text><Text style={[styles.largeSuit, styles.redSuit]}>♥</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>FT</Text></View>
          <Text style={styles.tableCaption}>GOOD FRIENDS. GREAT HANDS.</Text>
        </View>

        <Text style={styles.sectionTitle}>어떤 게임을 할까요?</Text>
        <View style={styles.gameRow}>
          {([{ id: 'holdem', symbol: '♠', name: '텍사스 홀덤', detail: '두 장의 패, 다섯 장의 공통 카드' }, { id: 'seotda', symbol: '花', name: '섯다', detail: '짧고 짜릿한 한 판' }] as const).map((item) => (
            <Pressable key={item.id} onPress={() => setGame(item.id)} accessibilityRole="radio" accessibilityState={{ checked: game === item.id }} style={[styles.game, game === item.id && styles.selectedGame]}>
              <Text style={styles.gameSymbol}>{item.symbol}</Text>
              <Text style={styles.gameName}>{item.name}</Text>
              <Text style={styles.gameDetail}>{item.detail}</Text>
              <Text style={[styles.selection, game === item.id && styles.selectedText]}>{game === item.id ? '선택됨 ✓' : '선택하기'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{game === 'holdem' ? '텍사스 홀덤' : '섯다'} 테이블을 준비하고 있어요</Text>
          <Text style={styles.noticeBody}>지금은 앱의 첫 화면입니다. 비공개 방과 실시간 플레이는 다음 단계에서 연결합니다.</Text>
        </View>
        <Text style={styles.footer}>친구와 함께할 다음 한 판을 위해.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101C18',
  },
  content: { paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 64 : 52, paddingBottom: 40, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 },
  brand: { color: '#F2E8CE', fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  badge: { color: '#C3CEBF', backgroundColor: '#26372E', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, fontSize: 11 },
  eyebrow: { color: '#C2B583', fontSize: 12, marginBottom: 12 },
  title: { color: '#FAF6E9', fontSize: 32, fontWeight: '800', lineHeight: 44, letterSpacing: -1 },
  subtitle: { color: '#A8B6AD', fontSize: 14, lineHeight: 23, marginTop: 14 },
  table: { height: 208, backgroundColor: '#1D3A2D', borderRadius: 100, borderWidth: 1, borderColor: '#3C5841', marginTop: 30, marginBottom: 30, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  card: { backgroundColor: '#F6F0DE', height: 110, width: 78, borderRadius: 10, padding: 10, transform: [{ rotate: '-13deg' }], marginTop: -15 },
  secondCard: { marginLeft: -12, transform: [{ rotate: '12deg' }], marginTop: -5 },
  blackSuit: { color: '#193227', fontSize: 23, fontWeight: '800' },
  redSuit: { color: '#B24B3F', fontSize: 23, fontWeight: '800' },
  largeSuit: { fontSize: 42, color: '#193227', textAlign: 'center' },
  chip: { position: 'absolute', right: 45, bottom: 41, backgroundColor: '#D5BD7F', borderColor: '#F9E8B5', borderWidth: 4, borderStyle: 'dashed', borderRadius: 25, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  chipText: { color: '#4F4328', fontWeight: '900', fontSize: 12 },
  tableCaption: { position: 'absolute', bottom: 17, color: '#A1B39C', fontSize: 9, letterSpacing: 2 },
  sectionTitle: { color: '#F6F0DE', fontSize: 18, fontWeight: '700', marginBottom: 15 },
  gameRow: { flexDirection: 'row', gap: 12 },
  game: { flex: 1, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#34453B', backgroundColor: '#19271F' },
  selectedGame: { borderColor: '#D5BD7F', backgroundColor: '#29382A' },
  gameSymbol: { color: '#D5BD7F', fontSize: 26, marginBottom: 12 },
  gameName: { color: '#FAF6E9', fontSize: 15, fontWeight: '700', marginBottom: 7 },
  gameDetail: { color: '#B2BFB4', fontSize: 11, lineHeight: 17, minHeight: 34 },
  selection: { color: '#A8B6AD', fontSize: 12, marginTop: 16 },
  selectedText: { color: '#E6D097' },
  notice: { marginTop: 22, padding: 17, backgroundColor: '#1B2B23', borderRadius: 14 },
  noticeTitle: { color: '#DEDCCB', fontWeight: '600', fontSize: 13, marginBottom: 7 },
  noticeBody: { color: '#A8B6AD', fontSize: 12, lineHeight: 20 },
  footer: { textAlign: 'center', color: '#93A498', fontSize: 11, marginTop: 26 },
});
