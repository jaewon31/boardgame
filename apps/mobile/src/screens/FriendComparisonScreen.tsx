import {useState} from 'react';
import {ScrollView,StyleSheet,Text} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ActionButton} from '../components/ActionButton';
import {FriendStatsScreen} from './FriendStatsScreen';

export function FriendComparisonScreen({people,selfId,onClose}:{people:{id:string;name:string}[];selfId:string;onClose:()=>void}) {
 const insets=useSafeAreaInsets();
 const [first,setFirst]=useState<string>(selfId),[second,setSecond]=useState<string|null>(null);
 const left=people.find(p=>p.id===first),right=people.find(p=>p.id===second);
 if(left&&right)return <FriendStatsScreen friendId={right.id===selfId?left.id:right.id} name={right.id===selfId?left.name:right.name} firstId={left.id!==selfId&&right.id!==selfId?left.id:undefined} firstName={left.id!==selfId&&right.id!==selfId?left.name:'나'} onClose={()=>setSecond(null)}/>;
 return <ScrollView testID="web-stats" contentContainerStyle={[styles.content,{paddingTop:insets.top+20,paddingBottom:insets.bottom+20}]}>
   <ActionButton compact secondary title="‹ 친구 목록" onPress={onClose}/>
   <Text style={styles.title}>상대 전적 비교</Text>
   <Text style={styles.note}>본인 또는 친구 두 명을 선택하세요. 친구끼리 비교하려면 두 사람도 서로 친구여야 해요.</Text>
   <Text style={styles.title}>1. 첫 번째 대상</Text>
   {people.map((p,i)=><ActionButton key={p.id} compact secondary={first!==p.id} title={`${first===p.id?'✓ ':''}${p.name}${p.id===selfId?' (나)':` · 친구 ${i}`}`} onPress={()=>{setFirst(p.id);setSecond(null);}}/>)}
   <Text style={styles.title}>2. 두 번째 대상</Text>
   {people.filter(p=>p.id!==first).map(p=><ActionButton key={p.id} compact secondary title={`${p.name}${p.id===selfId?' (나)':` · 친구 ${people.findIndex(v=>v.id===p.id)}`} 전적 보기`} onPress={()=>setSecond(p.id)}/>)}
   {people.length<2&&<Text style={styles.note}>수락된 친구가 아직 없어요.</Text>}
 </ScrollView>;
}
const styles=StyleSheet.create({content:{padding:20,gap:12,backgroundColor:'#101C18',flexGrow:1},title:{fontSize:18,color:'#FAF6E9',fontWeight:'700'},note:{fontSize:13,lineHeight:20,color:'#A5B5A9'}});
