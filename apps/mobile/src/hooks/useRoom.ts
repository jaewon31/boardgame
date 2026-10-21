import { authClient } from '../services/authClient';
import { createSessionStore } from '../services/sessionStore';
import { AppState } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import type { RoomSettings, EntryRequest, PokerAction } from '@boardgame/shared';
import { RoomClient, type RoomState } from '../services/RoomClient';
import { getServerUrl } from '../services/serverUrl';

export function useRoom(enabled=true) {
  const [state, setState] = useState<RoomState>({ status: 'idle', room: null, playerId: null, error: null });
  const client = useRef<RoomClient | null>(null);
  useEffect(() => {
    if(!enabled){setState({status:'idle',room:null,playerId:null,error:null});return;}
    const endpoint = getServerUrl();
    const connection = new RoomClient(endpoint, setState, {}, createSessionStore(endpoint));
    connection.accessToken=async()=>{const result=await authClient?.auth.getSession();if(!result?.data.session?.access_token)throw Error('AUTH_REQUIRED');return result.data.session.access_token;};
    client.current = connection;
    void connection.restore();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') connection.checkConnection(); });
    return () => { subscription.remove(); connection.dispose(); client.current = null; };
  }, [enabled]);
  return {
    ...state,
    enter: (request: EntryRequest) => client.current?.enter(request),
    updateSettings: (settings: RoomSettings) => client.current?.updateSettings(settings),
    startHand: () => client.current?.startHand(),
    revealRiver: (handId: string) => client.current?.revealRiver(handId),
    revealCards: (handId: string) => client.current?.revealCards(handId),
    resetChips: () => client.current?.resetChips(),
    act: (action: PokerAction, amount?: number) => client.current?.act(action, amount),
    leave: () => client.current?.leave(),
  };
}
