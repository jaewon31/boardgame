import type { RoomSettings } from './settings.ts';
export { DEFAULT_SETTINGS, validRoomSettings, SETTINGS_HELP } from './settings.ts';
export type { RoomSettings } from './settings.ts';
import type { HandReview, HoldemView, PokerAction } from './holdem.js';
export type { HandReview, HandReviewEvent, Card, HoldemView, LegalActions, PokerAction, HandPlayer } from './holdem.js';
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

export interface DailyResult {
  playerId: string; nickname: string; hands: number; wins: number; netChips: number;
}
export interface LobbyRoom {
  handReviews?: HandReview[];
  settingsRevision?: number;
  settings?: RoomSettings;
  todayResults?: { date: string; players: DailyResult[] };

  code: string;
  game: GameId;
  hostId: string;
  maxPlayers: number;
  holdem?: HoldemView;
  nextHandAt?: number | null;
  fundedPlayers?: number;
  players: LobbyPlayer[];
}

export type EntryRequest =
  | { type: 'create'; nickname: string; game: GameId; settings?: RoomSettings }
  | { type: 'join'; nickname: string; code: string };

export type ClientMessage = EntryRequest
  | { type: 'currentRoom'; previousCode?: string }
  | { type: 'ping'; id: number }
  | { type: 'resume'; code: string; token: string }
  | { type: 'leave' }
  | { type: 'updateSettings'; settings: RoomSettings; expectedRevision?: number; requestId?: string }
  | { type: 'startHand'; previousHandId: string | null; expectedSettingsRevision?: number }
  | { type: 'revealCards'; handId: string }
  | { type: 'revealRiver'; handId: string }
  | { type: 'resetChips'; handId: string }
  | { type: 'act'; handId: string; revision: number; action: PokerAction; amount?: number };

export { safeCloseReason } from './connectionDiagnostics.ts';

export type ErrorCode = 'INVALID_REQUEST' | 'ROOM_NOT_FOUND' | 'ROOM_FULL'
  | 'AUTH_REQUIRED' | 'AUTH_UNAVAILABLE' | 'NICKNAME_TAKEN' | 'SESSION_EXPIRED' | 'ALREADY_JOINED' | 'RATE_LIMITED' | 'SERVER_FULL' | 'GAME_ERROR';

export type ServerMessage =
  | { type: 'pong'; id: number }
  | { type: 'joined'; room: LobbyRoom; playerId: string; token: string }
  | { type: 'room'; room: LobbyRoom }
  | { type: 'left' }
  | { type: 'noRoom'; reason?: 'room-closed' | 'membership-ended' }
  | { type: 'settingsUpdated'; settings: RoomSettings; settingsRevision?: number; requestId?: string }
  | { type: 'error'; code: ErrorCode; message: string; recoverable?: boolean; requestId?: string };
