import { useEffect, useRef, useState } from 'react';
import type { EntryRequest } from '@boardgame/shared';
import { RoomClient, type RoomState } from '../services/RoomClient';
import { getServerUrl } from '../services/serverUrl';

export function useRoom() {
  const [state, setState] = useState<RoomState>({ status: 'idle', room: null, playerId: null, error: null });
  const client = useRef<RoomClient | null>(null);
  useEffect(() => {
    const connection = new RoomClient(getServerUrl(), setState);
    client.current = connection;
    return () => { connection.dispose(); client.current = null; };
  }, []);
  return {
    ...state,
    enter: (request: EntryRequest) => client.current?.enter(request),
    leave: () => client.current?.leave(),
  };
}
