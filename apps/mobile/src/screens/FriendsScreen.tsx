import { FriendStatsScreen } from './FriendStatsScreen';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Profile } from '../hooks/useAccount';
import { useFriends } from '../hooks/useFriends';
import { normalizeFriendCode } from '../services/friendTypes';
import { ActionButton } from '../components/ActionButton';
export function FriendsScreen({profile,onClose}:{profile:Profile;onClose:()=>void}) {
 const state=useFriends(profile.id),insets=useSafeAreaInsets(),height=useWindowDimensions().height;
 const [tab,setTab]=useState<'friends'|'incoming'|'outgoing'>('friends'),[adding,setAdding]=useState(false),[code,setCode]=useState(''),[page,setPage]=useState(0),[shareError,setShareError]=useState('');
 const [selected,setSelected]=useState<{id:string;name:string}|null>(null);
 const groups={friends:state.rows.filter(r=>r.status==='accepted'),incoming:state.rows.filter(r=>r.status==='pending'&&r.incoming),outgoing:state.rows.filter(r=>r.status==='pending'&&!r.incoming)};
 const pageSize=height<700?2:4,rows=groups[tab],pages=Math.max(1,Math.ceil(rows.length/pageSize)),current=Math.min(page,pages-1);
 function remove(id:string,name:string){Alert.alert(tab==='outgoing'?'요청을 취소할까요?':'친구를 삭제할까요?',name,[{text:'유지',style:'cancel'},{text:tab==='outgoing'?'취소하기':'삭제',style:'destructive',onPress:()=>void state.remove(id)}]);}
 async function share(){setShareError('');try{await Share.share({message:`Friends Table에서 친구가 되어 주세요.\n내 친구 코드: ${profile.friend_code}`});}catch{setShareError('공유 창을 열지 못했어요.');}}
 if(selected)return <FriendStatsScreen friendId={selected.id} name={selected.name} onClose={()=>setSelected(null)}/>;
 return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==='ios'?'padding':'height'}><View style={[styles.content,{paddingTop:insets.top+8,paddingBottom:insets.bottom+8}]}>
   <View style={styles.row}><Pressable accessibilityRole="button" onPress={()=>adding?setAdding(false):onClose()} style={styles.link}><Text style={styles.text}>‹ 뒤로</Text></Pressable><Text style={styles.title}>{adding?'친구 추가':'내 친구'}</Text><Pressable accessibilityRole="button" disabled={state.busy} onPress={()=>setAdding(!adding)} style={styles.link}><Text style={styles.gold}>{adding?'목록':'＋ 추가'}</Text></Pressable></View>
   <View style={styles.myCode}><View><Text style={styles.note}>내 친구 코드</Text><Text selectable style={styles.code}>{profile.friend_code}</Text></View><ActionButton compact secondary title="공유" onPress={()=>void share()}/></View>
   {adding?<View style={styles.add}>
     <Text style={styles.text}>친구가 알려준 코드를 입력해 주세요.</Text>
     <TextInput accessibilityLabel="친구 코드" placeholder="12자리 친구 코드" placeholderTextColor="#82988A" value={code} onChangeText={value=>setCode(normalizeFriendCode(value).replace(/[^A-F0-9]/g,''))} autoCapitalize="characters" autoCorrect={false} maxLength={12} editable={!state.busy} style={styles.input}/>
     <ActionButton title="친구 요청 보내기" disabled={!/^[A-F0-9]{12}$/.test(code)} busy={state.busy} onPress={()=>void state.request(code)}/>
     <Text style={styles.note}>상대가 수락하면 서로의 친구 목록에 표시돼요.</Text>
   </View>:<>
     <View accessibilityRole="tablist" style={styles.tabs}>{([['friends','친구'],['incoming','받은 요청'],['outgoing','보낸 요청']] as const).map(([id,label])=><Pressable key={id} accessibilityRole="tab" accessibilityState={{selected:tab===id}} onPress={()=>{setTab(id);setPage(0);}} style={[styles.tab,tab===id&&styles.selected]}><Text style={styles.text}>{label} {groups[id].length}</Text></Pressable>)}</View>
     <View style={styles.list}>{state.loading?<ActivityIndicator color="#DFC98D"/>:!rows.length?<Text style={styles.empty}>{tab==='friends'?'아직 친구가 없어요. 코드로 첫 친구를 추가해 보세요.':tab==='incoming'?'받은 요청이 없어요.':'보낸 요청이 없어요.'}</Text>:rows.slice(current*pageSize,(current+1)*pageSize).map(row=><View key={row.id} style={styles.friend}><Text numberOfLines={1} style={styles.name}>{row.display_name}</Text><View style={styles.actions}>{tab==='friends'&&<ActionButton compact title="전적" onPress={()=>setSelected({id:row.other_id,name:row.display_name})}/>} {tab==='incoming'?<><ActionButton compact title="수락" disabled={state.busy} onPress={()=>void state.respond(row.id,true)}/><ActionButton compact secondary title="거절" disabled={state.busy} onPress={()=>void state.respond(row.id,false)}/></>:<ActionButton compact secondary title={tab==='outgoing'?'취소':'삭제'} disabled={state.busy} onPress={()=>remove(row.id,row.display_name)}/>}</View></View>)}</View>
     <View style={styles.row}><ActionButton compact secondary title="이전" disabled={current===0} onPress={()=>setPage(current-1)}/><Text style={styles.note}>{current+1}/{pages}</Text><ActionButton compact secondary title="다음" disabled={current+1>=pages} onPress={()=>setPage(current+1)}/></View>
     <ActionButton compact secondary title="새로고침" disabled={state.busy||state.loading} onPress={()=>void state.refresh()}/>
   </>}
   {!!(state.message||shareError)&&<Text accessibilityRole="alert" style={styles.message}>{shareError||state.message}</Text>}
 </View></KeyboardAvoidingView>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#101C18'},content:{flex:1,paddingHorizontal:16,width:'100%',maxWidth:540,alignSelf:'center',gap:10},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},link:{minHeight:44,justifyContent:'center',paddingHorizontal:6},title:{fontSize:20,fontWeight:'800',color:'#FAF6E9'},text:{fontSize:12,color:'#E6DDC3'},gold:{color:'#DFC98D',fontWeight:'700'},note:{fontSize:11,color:'#9FB2A4',lineHeight:17},myCode:{backgroundColor:'#203329',padding:12,borderRadius:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},code:{fontSize:18,fontWeight:'800',letterSpacing:2,color:'#DFC98D'},tabs:{flexDirection:'row',gap:4},tab:{flex:1,minHeight:44,justifyContent:'center',alignItems:'center',backgroundColor:'#1B2B22',borderRadius:8},selected:{backgroundColor:'#45503A'},list:{flex:1,minHeight:0,gap:8,justifyContent:'center'},friend:{backgroundColor:'#1F3027',borderRadius:10,padding:8,flexDirection:'row',alignItems:'center',gap:6,minHeight:60},name:{flex:1,color:'#FAF6E9',fontSize:14,fontWeight:'700'},actions:{flexDirection:'row',gap:5},empty:{color:'#A5B5A9',textAlign:'center',fontSize:13,lineHeight:22},add:{flex:1,justifyContent:'center',gap:14},input:{minHeight:50,color:'#FAF6E9',fontSize:18,letterSpacing:2,backgroundColor:'#203329',borderColor:'#49614B',borderWidth:1,borderRadius:10,padding:12},message:{fontSize:12,lineHeight:18,color:'#E7D4A8'}});
