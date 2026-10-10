import { AppState } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import type { EntryRequest, PokerAction } from '@boardgame/shared';
import { RoomClient, type RoomState } from '../services/RoomClient';
import { getServerUrl } from '../services/serverUrl';

export function useRoom() {
  const [state, setState] = useState<RoomState>({ status: 'idle', room: null, playerId: null, error: null });
  const client = useRef<RoomClient | null>(null);
  useEffect(() => {
    const connection = new RoomClient(getServerUrl(), setState);
    client.current = connection;
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') connection.checkConnection(); });
    return () => { subscription.remove(); connection.dispose(); client.current = null; };
  }, []);
  return {
    ...state,
    enter: (request: EntryRequest) => client.current?.enter(request),
    startHand: () => client.current?.startHand(),
    revealRiver: (handId: string) => client.current?.revealRiver(handId),
    revealCards: (handId: string) => client.current?.revealCards(handId),
    resetChips: () => client.current?.resetChips(),
    act: (action: PokerAction, amount?: number) => client.current?.act(action, amount),
    leave: () => client.current?.leave(),
  };
}
