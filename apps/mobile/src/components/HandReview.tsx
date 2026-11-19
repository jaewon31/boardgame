import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LobbyRoom } from '@boardgame/shared';
import { CardFace } from './PokerCards';
const streets = {preflop:'프리플랍',flop:'플랍',turn:'턴',river:'리버',complete:'쇼다운 / 결과'};
export function HandReviewButton({room}: {room:LobbyRoom}) {
  const [open,setOpen]=useState(false), [selected,setSelected]=useState<string|null>(null);
  const insets=useSafeAreaInsets();
  const reviews=(room.handReviews ?? []).filter(r=>r.hand.street==='complete').slice().sort((a,b)=>b.hand.number-a.hand.number);
  const review=reviews.find(r=>r.hand.id===selected) ?? reviews[0], hand=review?.hand;
  const name=(id:string)=>hand?.players.find(p=>p.id===id)?.nickname ?? '기록 없음';
  return <View pointerEvents="box-none" style={styles.layer}>
    {open && <View testID="web-review" style={[styles.panel,{paddingTop:insets.top+12,paddingBottom:insets.bottom+12}]}>
      <View style={styles.row}><Text style={styles.title}>핸드 히스토리</Text><Pressable accessibilityRole="button" accessibilityLabel="히스토리 닫기" onPress={()=>setOpen(false)} style={styles.button}><Text style={styles.text}>닫기 ✕</Text></Pressable></View>
      <Text style={styles.note}>최근 10개 · 내 패와 공개된 패만 표시 · 방 종료 시 삭제</Text>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {!hand ? <Text style={styles.text}>완료된 핸드가 없어요.</Text> : <>
          {reviews.map(r=><Pressable key={r.hand.id} accessibilityRole="button" accessibilityState={{selected:r.hand.id===hand.id}} onPress={()=>setSelected(r.hand.id)} style={[styles.item,r.hand.id===hand.id&&styles.selected]}>
            <Text style={styles.text}>#{r.hand.number} · 최종 팟 {r.hand.pot.toLocaleString()}</Text>
            <Text style={styles.note}>{r.hand.payouts.map(p=>`${r.hand.players.find(v=>v.id===p.playerId)?.nickname ?? '기록 없음'} +${p.amount.toLocaleString()} (${p.handName})`).join(' · ') || r.hand.lastEvent}</Text>
          </Pressable>)}
          <Text style={styles.title}>#{hand.number} 상세</Text>
          <View style={styles.board}>{hand.board.map((card,i)=><CardFace key={i} card={card} width={38}/>)}</View>
          <Text style={styles.text}>최종 팟 {hand.pot.toLocaleString()} · {hand.lastEvent}</Text>
          {hand.pots.map((pot,i)=><Text key={i} style={styles.text}>{i===0?'메인 팟':`사이드 팟 ${i}`} {pot.amount.toLocaleString()} → {pot.winnerIds.map(name).join(', ')}</Text>)}
          {hand.refunds.map((r,i)=><Text key={i} style={styles.note}>미성립 베팅 반환: {name(r.playerId)} {r.amount.toLocaleString()}</Text>)}
          <Text style={styles.title}>최종 카드 · 칩 순변동</Text>
          {hand.players.map(p=><View key={p.id} style={styles.row}>
            <Text style={[styles.text,styles.name]}>{p.nickname}{hand.payouts.some(w=>w.playerId===p.id)?' ★':''}{p.folded?' · 폴드':''}</Text>
            <View style={styles.board}>{[0,1].map(i=><CardFace key={i} card={p.cards?.[i]} width={24}/>)}</View>
            <Text style={styles.text}>{review.netChips?.[p.id]===undefined?'기록 없음':`${review.netChips[p.id]>0?'+':''}${review.netChips[p.id].toLocaleString()}`}</Text>
          </View>)}
          <Text style={styles.title}>액션 기록</Text>
          <Text style={styles.note}>서버 저장 순서 · 최대 150개 · 오래된 액션은 생략될 수 있어요.</Text>
          {!review.events.length && <Text style={styles.note}>저장된 액션 기록이 없어요.</Text>}
          {review.events.map((event,i)=><View key={i} style={styles.item}>
            {(i===0 || review.events[i-1].street!==event.street) && <Text style={styles.heading}>{streets[event.street]}</Text>}
            <Text style={styles.text}>{i+1}. {event.text}</Text>
            <Text style={styles.note}>팟 {event.pot.toLocaleString()}</Text>
            {(i===0 || review.events[i-1].board.length!==event.board.length) && event.board.length>0 && <View style={styles.board}>{event.board.map((card,j)=><CardFace key={j} card={card} width={26}/>)}</View>}
          </View>)}
        </>}
      </ScrollView>
    </View>}
    <Pressable testID="history-toggle" accessibilityRole="button" accessibilityLabel={open?'핸드 히스토리 접기':'핸드 히스토리 열기'} accessibilityState={{expanded:open}} onPress={()=>setOpen(v=>!v)} style={styles.toggle}><Text style={styles.heading}>{open?'›':'‹'}</Text></Pressable>
  </View>;
}
const styles=StyleSheet.create({
  layer:{position:'absolute',left:0,right:0,top:0,bottom:0,zIndex:30},
  panel:{position:'absolute',right:0,top:0,bottom:0,width:'92%',maxWidth:400,backgroundColor:'#0D171D',paddingHorizontal:16,paddingRight:44,gap:10,borderLeftWidth:1,borderLeftColor:'#456054'},
  toggle:{position:'absolute',right:0,top:'45%',width:36,minHeight:56,backgroundColor:'#263F3C',borderTopLeftRadius:12,borderBottomLeftRadius:12,alignItems:'center',justifyContent:'center'},
  scroll:{flex:1},content:{gap:12,paddingBottom:20},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},title:{color:'#FAF6E9',fontSize:16,fontWeight:'800'},text:{color:'#E8DBB9',fontSize:12},note:{color:'#A8B6AD',fontSize:11,lineHeight:16},heading:{color:'#D6FF94',fontSize:18,fontWeight:'700'},button:{minHeight:44,paddingHorizontal:10,justifyContent:'center'},board:{flexDirection:'row',gap:4},item:{backgroundColor:'#172A2D',padding:10,borderRadius:8,gap:5},selected:{borderWidth:1,borderColor:'#D6FF94'},name:{flex:1}
});
