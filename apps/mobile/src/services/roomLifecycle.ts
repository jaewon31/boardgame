import { AppState } from 'react-native';
import type { RoomClient } from './RoomClient';
export function watchRoomLifecycle(connection:RoomClient) {
  connection.recordAppState(AppState.currentState);
  const sub=AppState.addEventListener('change',state=>{connection.recordAppState(state);if(state==='active')connection.refresh(true);});
  return ()=>sub.remove();
}
