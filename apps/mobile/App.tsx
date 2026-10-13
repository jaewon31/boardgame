import { GameScreen } from './src/screens/GameScreen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useRoom } from './src/hooks/useRoom';
import HomeScreen from './src/screens/HomeScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';

function Screens() {
  const room = useRoom();
  return <>
    <StatusBar style="light" />
    {room.room?.holdem ? <GameScreen room={room.room} playerId={room.playerId} connected={room.status === 'connected'} error={room.error} onLeave={room.leave} onReset={room.resetChips} onAct={room.act} onReveal={room.revealCards} onRevealRiver={room.revealRiver} /> : room.room ? <LobbyScreen room={room.room} playerId={room.playerId} connected={room.status === 'connected'} error={room.error} onLeave={room.leave} onStart={room.startHand} />
      : <HomeScreen onCancel={room.leave} onEnter={room.enter} busy={room.status === 'connecting' || room.status === 'reconnecting'} error={room.error} />}
  </>;
}
export default function App() {
  return <SafeAreaProvider><Screens /></SafeAreaProvider>;
}
