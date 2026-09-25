import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useRoom } from './src/hooks/useRoom';
import HomeScreen from './src/screens/HomeScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';

function Screens() {
  const room = useRoom();
  return <>
    <StatusBar style="light" />
    {room.room ? <LobbyScreen room={room.room} playerId={room.playerId} connected={room.status === 'connected'} error={room.error} onLeave={room.leave} />
      : <HomeScreen onEnter={room.enter} busy={room.status === 'connecting'} error={room.error} />}
  </>;
}
export default function App() {
  return <SafeAreaProvider><Screens /></SafeAreaProvider>;
}
