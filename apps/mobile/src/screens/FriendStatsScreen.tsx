import {useEffect,useState} from 'react';
import {ActivityIndicator,StyleSheet,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {authClient} from '../services/authClient';
import {getServerUrl} from '../services/serverUrl';
import {ActionButton} from '../components/ActionButton';
interface Stats {hands:number;mine:{wins:number;netChips:number};friend:{wins:number;netChips:number}}
export function FriendStatsScreen({friendId,name,onClose}:{friendId:string;name:string;onClose:()=>void}){
 const insets=useSafeAreaInsets(),[stats,setStats]=useState<Stats|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
 useEffect(()=>{
   const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),8000);let active=true;setLoading(true);setError('');setStats(null);
   void(async()=>{
     try{
       const session=await authClient?.auth.getSession();if(!session?.data.session)throw Error('로그인이 필요해요.');
       const base=getServerUrl().replace(/^ws/,'http').replace(/\/lobby\/?$/,'');
       const response=await fetch(base+'/friends/'+encodeURIComponent(friendId)+'/stats',{headers:{Authorization:'Bearer '+session.data.session.access_token},signal:abort.signal});
       if(!response.ok)throw Error(response.status===403?'친구 관계를 확인해 주세요.':response.status===401?'다시 로그인해 주세요.':'전적을 불러오지 못했어요. 게임 서버 연결을 확인해 주세요.');
       const data=await response.json();if(active)setStats(data);
     }catch(e){if(active)setError(e instanceof Error&&e.name!=='AbortError'?e.message:'응답이 늦어지고 있어요. 다시 시도해 주세요.');}
     finally{clearTimeout(timeout);if(active)setLoading(false);}
   })();return()=>{active=false;abort.abort();clearTimeout(timeout);};
 },[friendId,reload]);
 const chips=(n:number)=>(n>0?'+':'')+n.toLocaleString();
 const percent=(wins:number,hands:number)=>hands?((wins/hands)*100).toFixed(1)+'%':'—';
 return <View style={[styles.screen,{paddingTop:insets.top+12,paddingBottom:insets.bottom+12}]}>
   <View style={styles.header}><ActionButton compact secondary title="‹ 친구 목록" onPress={onClose}/><Text style={styles.title}>함께한 기록</Text></View>
   <Text numberOfLines={1} style={styles.name}>{name}</Text>
   <View style={styles.body}>{loading?<ActivityIndicator color="#DFC98D"/>:error?<><Text accessibilityRole="alert" style={styles.note}>{error}</Text><ActionButton title="다시 시도" onPress={()=>setReload(v=>v+1)}/></>:stats?<>
     <Text style={styles.note}>함께 플레이한 홀덤</Text><Text style={styles.total}>{stats.hands.toLocaleString()}판</Text>
     {!stats.hands?<Text style={styles.note}>아직 함께한 기록이 없어요.{"\n"}같은 방에서 한 판을 끝내면 여기에 쌓여요.</Text>:<>
       <View style={styles.row}><Text style={styles.label}>기록</Text><Text style={styles.cell}>나</Text><Text numberOfLines={1} style={styles.cell}>{name}</Text></View>
       <View style={styles.row}><Text style={styles.label}>팟 획득</Text><Text style={styles.cell}>{stats.mine.wins}회</Text><Text style={styles.cell}>{stats.friend.wins}회</Text></View>
       <View style={styles.row}><Text style={styles.label}>팟 획득률</Text><Text style={styles.cell}>{percent(stats.mine.wins,stats.hands)}</Text><Text style={styles.cell}>{percent(stats.friend.wins,stats.hands)}</Text></View>
       <View style={styles.row}><Text style={styles.label}>칩 증감</Text><Text style={styles.cell}>{chips(stats.mine.netChips)}</Text><Text style={styles.cell}>{chips(stats.friend.netChips)}</Text></View>
     </>}
     <Text style={styles.note}>같이 참여한 판만 집계해요. 나눠 가진 팟은 양쪽 모두 획득으로 세며, 다른 참가자의 결과도 있어 일대일 승률과는 달라요. 칩 증감은 게임 칩 기준이에요.</Text>
   </>:null}</View>
   <ActionButton compact secondary title="새로고침" disabled={loading} onPress={()=>setReload(v=>v+1)}/>
 </View>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#101C18',paddingHorizontal:20,gap:12},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},title:{color:'#FAF6E9',fontSize:18,fontWeight:'800'},name:{color:'#DFC98D',fontSize:22,fontWeight:'800'},body:{flex:1,justifyContent:'center',gap:14,width:'100%',maxWidth:540,alignSelf:'center'},note:{color:'#A5B5A9',fontSize:12,lineHeight:20,textAlign:'center'},total:{color:'#FAF6E9',fontSize:40,fontWeight:'800',textAlign:'center'},row:{flexDirection:'row',paddingVertical:10,borderBottomColor:'#31453A',borderBottomWidth:1,gap:6},label:{color:'#A5B5A9',flex:1,fontSize:12},cell:{color:'#FAF6E9',flex:1,textAlign:'right',fontSize:14,fontWeight:'700'}});
