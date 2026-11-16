import type { RoomClient } from './RoomClient';
export function watchRoomLifecycle(connection:RoomClient) {
  const resume=()=>{if(document.visibilityState==='visible'){connection.recordAppState('active');connection.resynchronize();}};
  const visibility=()=>{if(document.visibilityState==='visible')resume();else connection.recordAppState('background');};
  connection.recordAppState(document.visibilityState==='visible'?'active':'background');
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('pageshow',resume);
  window.addEventListener('online',resume);
  return ()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pageshow',resume);window.removeEventListener('online',resume);};
}
