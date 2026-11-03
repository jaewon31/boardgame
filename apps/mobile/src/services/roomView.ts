import type { RoomState } from './RoomClient.ts';
import { emptyState } from './RoomClient.ts';

export type RoomPhase = 'NO_ROOM' | 'CHECKING_ROOM' | 'IN_LOBBY' | 'IN_GAME' | 'RECONNECTING' | 'ERROR';
// Derived presentation only: never a second copy of server membership.
export function roomPhase(state: RoomState): RoomPhase {
  if (state.status === 'error' || state.status === 'disconnected') return 'ERROR';
  if (state.status === 'reconnecting') return 'RECONNECTING';
  if (state.status === 'connecting') return 'CHECKING_ROOM';
  return state.room ? (state.room.holdem ? 'IN_GAME' : 'IN_LOBBY') : 'NO_ROOM';
}
export function roomStateForAccount(accountId: string | null, snapshot: { accountId: string | null; state: RoomState }): RoomState {
  if (!accountId) return emptyState;
  return snapshot.accountId === accountId ? snapshot.state : { ...emptyState, status: 'connecting' };
}
