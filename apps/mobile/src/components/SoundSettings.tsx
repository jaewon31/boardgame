import { soundCatalog, type GameSound } from '../services/soundCatalog';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GameAudio } from '../hooks/useGameAudio';
export function SoundSettings({audio}:{audio:GameAudio}) {
  const [open,setOpen]=useState(false);
  const button=(label:string,action:()=>void,selected=false)=><Pressable accessibilityRole="button" accessibilityState={{selected}} disabled={!audio.loaded} onPress={action} style={[styles.button,selected&&styles.selected]}><Text style={styles.text}>{label}</Text></Pressable>;
  return <>
    {button(audio.muted || audio.level===0?'소리 꺼짐':'소리',()=>setOpen(true))}
    <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
      <View style={styles.overlay}><View style={styles.panel}>
        <Text style={styles.title}>게임 효과음</Text>
        <Text style={styles.text}>카드 · 칩 · 내 차례 · 시간 경고 · 승리</Text>
        {button(audio.muted?'음소거 해제':'음소거',()=>audio.setMuted(!audio.muted),audio.muted)}
        <View style={styles.row}>{[0.25,0.5,0.75,1].map(value=><View key={value} style={{flex:1}}>{button(`${value*100}%`,()=>{audio.setLevel(value);audio.setMuted(false);},audio.level===value&&!audio.muted)}</View>)}</View>
        <Text style={styles.note}>휴대폰 미디어 볼륨을 확인해 주세요. iPhone 무음 모드에서는 소리가 나지 않아요.</Text>
        <ScrollView style={{maxHeight:240}}>
          {(Object.keys(soundCatalog) as GameSound[]).map(sound=><View key={sound} style={styles.gainRow}>
            <Text style={styles.text}>{soundCatalog[sound].label} · {Math.round(audio.gains[sound]*100)}%</Text>
            <View style={styles.row}>
              {button('−',()=>audio.setSoundGain(sound,audio.gains[sound]-0.1))}
              {button('+',()=>audio.setSoundGain(sound,audio.gains[sound]+0.1))}
              {button('듣기',()=>audio.preview(sound))}
            </View>
          </View>)}
        </ScrollView>
        {!!audio.error&&<Text style={styles.text}>{audio.error}</Text>}
        <View style={styles.row}>{button('미리 듣기',()=>audio.preview())}{button('닫기',()=>setOpen(false))}</View>
      </View></View>
    </Modal>
  </>;
}
const styles=StyleSheet.create({gainRow:{paddingVertical:6,gap:4},button:{minHeight:44,paddingHorizontal:8,justifyContent:'center',alignItems:'center',borderRadius:8,backgroundColor:'#263F3C'},selected:{backgroundColor:'#5B5436'},text:{color:'#E8DBB9',fontSize:12},title:{color:'#FAF6E9',fontSize:18,fontWeight:'700'},note:{color:'#A8B6AD',fontSize:11,lineHeight:17},row:{flexDirection:'row',gap:6,justifyContent:'space-between'},overlay:{flex:1,backgroundColor:'#000B',justifyContent:'center',padding:20},panel:{maxHeight:'95%',backgroundColor:'#172A2D',borderRadius:16,padding:16,gap:12}});
