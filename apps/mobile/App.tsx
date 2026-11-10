import { FriendsScreen } from './src/screens/FriendsScreen';
import { needsNickname, showAccountEntry } from './src/services/accountFlow';
import { useAccount } from './src/hooks/useAccount';
import { AccountScreen } from './src/screens/AccountScreen';
import { useGameAudio } from './src/hooks/useGameAudio';
import { useEffect, useState } from 'react';
import { Alert, BackHandler, Linking } from 'react-native';
import { inviteCode } from './src/services/invite';
import { GameScreen } from './src/screens/GameScreen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useRoom } from './src/hooks/useRoom';
import HomeScreen from './src/screens/HomeScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';

function Screens() {
  const account = useAccount();
  const setup = needsNickname(account.profile);
  const room = useRoom(!account.loading && !!account.user && !!account.profile && !setup && !account.sessionBlocked ? account.user.id : null);
  const [roomOpen, setRoomOpen] = useState(true);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!room.room || !roomOpen) return false;
      setRoomOpen(false); return true;
    });
    return () => sub.remove();
  }, [room.room?.code, roomOpen]);
  function returnToRoom() { room.refresh(); setRoomOpen(true); }
  function leaveRoom() {
    Alert.alert('방에서 나갈까요?', '참여 상태가 정리됩니다. 방장이 나가면 다른 참여자에게 위임되고, 마지막 참여자가 나가면 방이 닫힙니다. 진행 중인 패는 폴드됩니다.', [
      { text: '취소', style: 'cancel' }, { text: '방 나가기', style: 'destructive', onPress: room.leave },
    ]);
  }
  const [accountOpen,setAccountOpen] = useState(false);
  const [friendsOpen,setFriendsOpen] = useState(false);
  useEffect(()=>setFriendsOpen(false),[account.user?.id]);
  useEffect(()=>{if(account.user)setAccountOpen(false);},[account.user?.id]);
  const audio = useGameAudio(room.room?.holdem ?? null, room.playerId, room.status === 'connected', room.room?.nextHandAt);
  const [incoming,setIncoming] = useState<string | null>(null);
  const [invite,setInvite] = useState<{code:string} | undefined>();
  useEffect(() => {
    let mounted=true;
    const receive=(url:string | null)=>{ const code=inviteCode(url); if(mounted && code)setIncoming(code); };
    const sub=Linking.addEventListener('url',event=>receive(event.url));
    void Linking.getInitialURL().then(url=>receive(url ?? null)).catch(()=>{});
    return ()=>{mounted=false;sub.remove();};
  },[]);
  useEffect(() => {
    if(!incoming || room.status==='connecting' || room.status==='reconnecting') return;
    const code=incoming;
    setIncoming(null);
    if(room.room?.code===code) { returnToRoom(); return; }
    if(room.room) Alert.alert('초대받은 방으로 이동할까요?', '현재 방을 나가면 진행 중인 패는 폴드됩니다.',[
      {text:'취소',style:'cancel'}, {text:'이동',onPress:()=>{room.leave();setRoomOpen(false);setInvite({code});}},
    ]);
    else setInvite({code});
  },[incoming,room.status,room.room?.code]);
  if(showAccountEntry({hasRoom:!!room.room && roomOpen,configured:account.configured,loading:account.loading,user:!!account.user,profile:!!account.profile,setup,blocked:account.sessionBlocked,opened:accountOpen})) return <><StatusBar style="light"/><AccountScreen account={account} setup={setup} onClose={()=>{account.clearMessage();setAccountOpen(false);}} /></>;
  if(friendsOpen && account.profile && (!room.room || !roomOpen)) return <><StatusBar style="light"/><FriendsScreen profile={account.profile} onClose={()=>setFriendsOpen(false)}/></>;
  return <>
    <StatusBar style="light" />
    {roomOpen && room.room?.holdem ? <GameScreen audio={audio} room={room.room} playerId={room.playerId} connected={room.status === 'connected'} error={room.error} onLeave={leaveRoom} onReset={room.resetChips} onAct={room.act} onReveal={room.revealCards} onRevealRiver={room.revealRiver} /> : roomOpen && room.room ? <LobbyScreen key={`${account.user?.id}:${room.room.code}`} onRetry={room.refresh} onHome={()=>setRoomOpen(false)} room={room.room} playerId={room.playerId} connected={room.status === 'connected'} error={room.error} onLeave={leaveRoom} onStart={room.startHand} onSettings={room.updateSettings} />
      : <HomeScreen phase={room.phase} notice={room.notice} onDismissNotice={room.clearNotice} activeRoom={room.room} playerId={room.playerId} connected={room.status === 'connected'} onReturn={returnToRoom} onLeave={leaveRoom} onRetry={room.refresh} onFriends={()=>setFriendsOpen(true)} accountName={account.profile?.display_name} onAccount={()=>setAccountOpen(true)} invite={invite} onCancel={room.cancel} onEnter={request=>{if(!account.user||!account.profile||setup||account.sessionBlocked){setAccountOpen(true);return;}setRoomOpen(true);room.enter(request);}} busy={room.status === 'connecting' || room.status === 'reconnecting'} error={room.error} />}
  </>;
}
export default function App() {
  return <SafeAreaProvider><Screens /></SafeAreaProvider>;
}
