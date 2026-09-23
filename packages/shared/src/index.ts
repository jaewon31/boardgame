// Public data contracts. The server alone owns room state and membership.
export type GameId = 'holdem' | 'seotda';

export interface HealthResponse {
  status: 'ok';
  service: 'boardgame-server';
}

export interface LobbyPlayer {
  id: string;
  nickname: string;
  connected: boolean;
}

export interface LobbyRoom {
  code: string;
  game: GameId;
  hostId: string;
  maxPlayers: number;
  players: LobbyPlayer[];
}

export type EntryRequest =
  | { type: 'create'; nickname: string; game: GameId }
  | { type: 'join'; nickname: string; code: string };

export type ClientMessage = EntryRequest
  | { type: 'resume'; code: string; token: string }
  | { type: 'leave' };

export type ErrorCode = 'INVALID_REQUEST' | 'ROOM_NOT_FOUND' | 'ROOM_FULL'
  | 'NICKNAME_TAKEN' | 'SESSION_EXPIRED' | 'ALREADY_JOINED' | 'RATE_LIMITED' | 'SERVER_FULL';

export type ServerMessage =
  | { type: 'joined'; room: LobbyRoom; playerId: string; token: string }
  | { type: 'room'; room: LobbyRoom }
  | { type: 'left' }
  | { type: 'error'; code: ErrorCode; message: string };
