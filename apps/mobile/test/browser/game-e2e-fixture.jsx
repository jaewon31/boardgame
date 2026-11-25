// LOCAL E2E ONLY. Bundled exclusively by scripts/test-game-e2e.cjs; never imported by the app.
// The harness replaces `authClient` and `serverUrl` at bundle time and serves this page on
// 127.0.0.1 next to a local game server. Everything below is the real web app code path:
// useRoom (RoomClient/WebSocket) → useGameAudio (SoundEvents/CardPresentation/AudioScheduler/expo-audio)
// → LobbyScreen/GameScreen, wired the same way as App.tsx.
import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useRoom } from '../../src/hooks/useRoom';
import { useGameAudio } from '../../src/hooks/useGameAudio';
import { GameScreen } from '../../src/screens/GameScreen';
import { LobbyScreen } from '../../src/screens/LobbyScreen';
import { WebDialogs } from '../../src/services/platformUI';
import { SeatPanel, showGameSeatPanel } from '../../src/components/SeatPanel';
import { RebuyButton, RebuyPanel } from '../../src/components/RebuyPanel';

const identity = window.__friendsTableE2E;

function E2EApp() {
  const room = useRoom(identity?.accountId ?? null);
  const audio = useGameAudio(room.room?.holdem ?? null, room.playerId, room.status === 'connected', room.room?.nextHandAt);
  // Read-only view for the test driver plus the same commands the app's buttons call.
  useEffect(() => {
    window.e2e = { room, audio, enter: request => room.enter(request), revealRiver: id => room.revealRiver(id), resetChips: () => room.resetChips(),
      setMuted: value => audio.setMuted(value) };
  });
  if (!identity) return <div>E2E identity missing</div>;
  // Seat wiring mirrors App.tsx.
  const seats = { onRequest: seat => room.requestSeat(seat), onCancel: () => room.cancelSeatRequest(), onResolve: (id, approve) => room.resolveSeatRequest(id, approve), onStandUp: () => room.standUp() };
  const rebuys = { onRequest: amount => room.requestRebuy(amount), onCancel: () => room.cancelRebuyRequest(), onResolve: (id, approve) => room.resolveRebuyRequest(id, approve) };
  const seatPanel = room.room && showGameSeatPanel(room.room, room.playerId)
    ? <View style={{ gap: 6 }}>
      <SeatPanel compact room={room.room} playerId={room.playerId} connected={room.status === 'connected'} {...seats}
        accessory={<RebuyButton room={room.room} playerId={room.playerId} connected={room.status === 'connected'} onRequest={rebuys.onRequest} />} />
      <RebuyPanel compact room={room.room} playerId={room.playerId} connected={room.status === 'connected'} onCancel={rebuys.onCancel} onResolve={rebuys.onResolve} />
    </View> : null;
  if (room.room?.holdem) return <GameScreen audio={audio} room={room.room} playerId={room.playerId} connected={room.status === 'connected'} error={room.error}
    onLeave={room.leave} onReset={room.resetChips} onAct={room.act} onReveal={room.revealCards} onRevealRiver={room.revealRiver} seatPanel={seatPanel} />;
  if (room.room) return <LobbyScreen room={room.room} playerId={room.playerId} connected={room.status === 'connected'} error={room.error}
    onLeave={room.leave} onHome={() => {}} onRetry={room.refresh} onStart={room.startHand} onSettings={room.updateSettings}
    onRequestSeat={seats.onRequest} onCancelSeat={seats.onCancel} onResolveSeat={seats.onResolve} onStandUp={seats.onStandUp} onRequestRebuy={rebuys.onRequest} onCancelRebuy={rebuys.onCancel} onResolveRebuy={rebuys.onResolve} />;
  return <div data-testid="e2e-idle">{room.status}</div>;
}

createRoot(document.getElementById('root')).render(<SafeAreaProvider><E2EApp /><WebDialogs /></SafeAreaProvider>);
