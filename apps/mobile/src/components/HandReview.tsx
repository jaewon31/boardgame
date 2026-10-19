import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LobbyRoom } from '@boardgame/shared';
import { CardFace } from './PokerCards';
const streets = {preflop:'프리플랍',flop:'플랍',turn:'턴',river:'리버',complete:'결과'};
export function HandReviewButton({room}: {room:LobbyRoom}) {
  const [open,setOpen]=useState(false), [selected,setSelected]=useState<string|null>(null), [step,setStep]=useState(0);
  const insets=useSafeAreaInsets();
  const reviews=room.handReviews ?? [];
  const index=Math.max(0,reviews.findIndex(r=>r.hand.id===selected));
  const review=reviews[index], hand=review?.hand;
  const current=Math.min(step,Math.max(0,(review?.events.length ?? 1)-1));
  const event=review?.events[current];
  // Do not conceal a live turn behind a review window when a new hand starts.
  useEffect(()=>{if(room.holdem?.legal) setOpen(false);},[room.holdem?.id,room.holdem?.revision]);
  function select(next:number) {setSelected(reviews[next].hand.id);setStep(0);}
  const button=(label:string,fn:()=>void,disabled=false)=><Pressable accessibilityRole="button" disabled={disabled} onPress={fn} style={[styles.button,disabled&&styles.disabled]}><Text style={styles.text}>{label}</Text></Pressable>;
  return <>
    {button('핸드 복기',()=>{setSelected(reviews[0]?.hand.id ?? null);setStep(0);setOpen(true);},!reviews.length || !!room.holdem?.legal)}
    <Modal visible={open} animationType="slide" onRequestClose={()=>setOpen(false)}>
      <View style={[styles.screen,{paddingTop:insets.top+8,paddingBottom:insets.bottom+8}]}>
        <View style={styles.row}><Text style={styles.title}>핸드 리뷰</Text>{button('닫기',()=>setOpen(false))}</View>
        <Text style={styles.note}>최근 10개 · 내 패와 공개된 패만 표시 · 방 종료 시 삭제</Text>
        {!hand ? <Text style={styles.text}>완료된 핸드가 없어요.</Text> : <>
          <View style={styles.row}>{button('이전 판',()=>select(index+1),index+1>=reviews.length)}<Text style={styles.title}>#{hand.number}</Text>{button('다음 판',()=>select(index-1),index===0)}</View>
          <View style={styles.board}>{Array.from({length:5},(_,i)=><CardFace key={i} card={(event?.board ?? hand.board)[i]} width={36}/>)}</View>
          <Text style={styles.pot}>{event ? streets[event.street] : '결과'} · 팟 {(event?.pot ?? hand.pot).toLocaleString()}</Text>
          <View style={styles.timeline}><Text style={styles.note}>행동 {review.events.length ? current+1 : 0} / {review.events.length}</Text><Text style={styles.event}>{event?.text ?? '이 핸드는 행동 기록 도입 전에 시작됐어요.'}</Text></View>
          <View style={styles.row}>{button('◀ 이전 행동',()=>setStep(current-1),current===0)}{button('다음 행동 ▶',()=>setStep(current+1),current+1>=review.events.length)}</View>
          <Text style={styles.note}>최종 패 · 칩 순손익 (공개된 패는 결과 기준)</Text>
          <View style={styles.players}>{hand.players.map(p=>{
            const award=hand.payouts.find(w=>w.playerId===p.id);
            const net=review.netChips?.[p.id];
            return <View key={p.id} style={styles.player}><Text numberOfLines={1} style={styles.name}>{p.nickname}{award?' ★':''}</Text><View style={styles.hole}>{[0,1].map(i=><CardFace key={i} card={p.cards?.[i]} width={20}/>)}</View><Text style={styles.result}>{net===undefined?'—':(net>0?'+':'')+net.toLocaleString()}{'\n'}{p.folded?'폴드':award?.handName ?? (p.cards?'패 공개':'비공개')}</Text></View>;
          })}</View>
          <Text style={styles.note}>메인·사이드 팟 지급 합산 · 미성립 베팅 반환은 손익에서 제외</Text>
        </>}
      </View>
    </Modal>
  </>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#0D171D',paddingHorizontal:16,gap:6},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},title:{color:'#FAF6E9',fontSize:18,fontWeight:'800'},text:{color:'#E8DBB9',fontSize:12},note:{color:'#A8B6AD',fontSize:10},button:{minHeight:44,paddingHorizontal:12,borderRadius:8,backgroundColor:'#263F3C',alignItems:'center',justifyContent:'center'},disabled:{opacity:.35},board:{flexDirection:'row',justifyContent:'center',gap:4,marginTop:4},pot:{color:'#F4D57C',textAlign:'center',fontWeight:'700'},timeline:{backgroundColor:'#172A2D',padding:10,borderRadius:8,minHeight:66,justifyContent:'center',gap:4},event:{color:'#FAF6E9',fontSize:14},players:{flex:1,justifyContent:'space-evenly',minHeight:0},player:{flexDirection:'row',alignItems:'center',gap:8},name:{flex:1,color:'#FAF6E9',fontSize:12},hole:{flexDirection:'row',gap:3},result:{width:110,color:'#DFCCA0',fontSize:11,textAlign:'right'}});
