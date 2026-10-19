import { useGameAudio } from './src/hooks/useGameAudio';
import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { inviteCode } from './src/services/invite';
import { GameScreen } from './src/screens/GameScreen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useRoom } from './src/hooks/useRoom';
import HomeScreen from './src/screens/HomeScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';

function Screens() {
  const room = useRoom();
  const audio = useGameAudio(room.room?.holdem ?? null, room.playerId, room.status === 'connected');
  const [incoming,setIncoming] = useState<string | null>(null);
  const [invite,setInvite] = useState<{code:string} | undefined>();
  useEffect(() => {
    let mounted=true;
    const receive=(url:string | null)=>{ const code=inviteCode(url); if(mounted && code)setIncoming(code); };
    const sub=Linking.addEventListener('url',event=>receive(event.url));
    void Linking.getInitialURL().then(receive).catch(()=>{});
    return ()=>{mounted=false;sub.remove();};
  },[]);
  useEffect(() => {
    if(!incoming || room.status==='connecting' || room.status==='reconnecting') return;
    const code=incoming;
    setIncoming(null);
    if(room.room?.code===code) return;
    if(room.room) Alert.alert('초대받은 방으로 이동할까요?', '현재 방을 나가면 진행 중인 패는 폴드됩니다.',[
      {text:'취소',style:'cancel'}, {text:'이동',onPress:()=>{room.leave();setInvite({code});}},
    ]);
    else setInvite({code});
  },[incoming,room.status,room.room?.code]);
  return <>
    <StatusBar style="light" />
    {room.room?.holdem ? <GameScreen audio={audio} room={room.room} playerId={room.playerId} connected={room.status === 'connected'} error={room.error} onLeave={room.leave} onReset={room.resetChips} onAct={room.act} onReveal={room.revealCards} onRevealRiver={room.revealRiver} /> : room.room ? <LobbyScreen room={room.room} playerId={room.playerId} connected={room.status === 'connected'} error={room.error} onLeave={room.leave} onStart={room.startHand} onSettings={room.updateSettings} />
      : <HomeScreen invite={invite} onCancel={room.leave} onEnter={room.enter} busy={room.status === 'connecting' || room.status === 'reconnecting'} error={room.error} />}
  </>;
}
export default function App() {
  return <SafeAreaProvider><Screens /></SafeAreaProvider>;
}
