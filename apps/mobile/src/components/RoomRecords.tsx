import { HandReviewButton } from './HandReview';
import { useState } from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LobbyRoom } from '@boardgame/shared';
import { ActionButton } from './ActionButton';
import { shareInvite } from '../services/shareInvite';
export function RoomRecords({ room }: { room: LobbyRoom }) {
  const [open,setOpen]=useState(false), [page,setPage]=useState(0), [error,setError]=useState('');
  const insets=useSafeAreaInsets();
  const rows=[...(room.todayResults?.players ?? [])].sort((a,b)=>b.netChips-a.netChips || b.wins-a.wins || a.nickname.localeCompare(b.nickname));
  const pages=Math.max(1,Math.ceil(rows.length/3)), current=Math.min(page,pages-1);
  const signed=(n:number)=>(n>0?'+':'')+n.toLocaleString();
  async function share(result:boolean) {
    setError('');
    try {
      if(result) await Share.share({message:'Friends Table · 오늘 이 방 결과 (' + (room.todayResults?.date ?? '') + ', 한국 시간)\n' + rows.map((p,i)=>(i+1)+'. '+p.nickname+' · '+signed(p.netChips)+'칩 · '+p.wins+'/'+p.hands+'판 승리').join('\n')});
      else await shareInvite(room.code);
    } catch { setError('공유 창을 열지 못했어요. 다시 시도해 주세요.'); }
  }
  return <>
    <Pressable accessibilityRole="button" onPress={()=>{setPage(0);setOpen(true);}} style={styles.trigger}><Text style={styles.gold}>초대·기록</Text></Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
      <View style={[styles.overlay,{paddingTop:insets.top+8,paddingBottom:insets.bottom+8}]}><View style={styles.panel}>
        <View style={styles.row}><Text style={styles.title}>오늘 이 방 결과</Text><Pressable accessibilityRole="button" onPress={()=>setOpen(false)} style={styles.trigger}><Text style={styles.gold}>닫기 ✕</Text></Pressable></View>
        <Text style={styles.note}>{room.todayResults?.date ?? ''} · 한국 시간 · 완료된 판 기준</Text>
        {rows.length ? rows.slice(current*3,current*3+3).map((p,i)=><View key={p.playerId} style={styles.entry}><Text numberOfLines={1} style={styles.name}>{current*3+i+1}. {p.nickname}</Text><Text style={styles.gold}>{signed(p.netChips)}칩</Text><Text style={styles.note}>{p.hands}판 · {p.wins}승</Text></View>) : <Text style={styles.empty}>첫 판이 끝나면 기록이 쌓여요.</Text>}
        {pages>1 && <View style={styles.row}><View style={styles.grow}><ActionButton compact secondary title="이전" disabled={current===0} onPress={()=>setPage(current-1)} /></View><Text style={styles.note}>{current+1}/{pages}</Text><View style={styles.grow}><ActionButton compact secondary title="다음" disabled={current+1>=pages} onPress={()=>setPage(current+1)} /></View></View>}
        <HandReviewButton room={room} />
        <Text style={styles.note}>공동 승리 포함 · 칩 초기화는 수익에 포함하지 않아요.</Text>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <View style={styles.row}><View style={styles.grow}><ActionButton compact secondary title="초대 링크 공유" onPress={()=>share(false)} /></View><View style={styles.grow}><ActionButton compact title="결과 공유" disabled={!rows.length} onPress={()=>share(true)} /></View></View>
      </View></View>
    </Modal>
  </>;
}
const styles=StyleSheet.create({trigger:{minHeight:44,paddingHorizontal:8,justifyContent:'center'},gold:{color:'#DFCCA0',fontSize:12,fontWeight:'700'},overlay:{flex:1,backgroundColor:'#000B',paddingHorizontal:16,alignItems:'center',justifyContent:'center'},panel:{width:'100%',maxWidth:480,backgroundColor:'#172A2D',borderRadius:16,padding:12,gap:8},row:{flexDirection:'row',gap:8,alignItems:'center',justifyContent:'space-between'},grow:{flex:1},title:{color:'#FAF6E9',fontWeight:'700',fontSize:17},note:{color:'#A8B6AD',fontSize:11},entry:{backgroundColor:'#20382F',borderRadius:8,padding:8,gap:3},name:{color:'#FAF6E9',fontSize:14,fontWeight:'600'},empty:{color:'#A8B6AD',paddingVertical:20,textAlign:'center'},error:{color:'#FFC09E',fontSize:12}});
