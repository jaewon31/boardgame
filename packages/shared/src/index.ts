import type { RoomSettings } from './settings.ts';
export { DEFAULT_SETTINGS, validRoomSettings, SETTINGS_HELP, MAX_REBUY_CHIPS, rebuyLimit } from './settings.ts';
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
  /** Fixed table seat 0..maxPlayers-1, or null when in the room but not seated. Absent from older servers. */
  seat?: number | null;
  /** Server-owned chip balance in this room (kept while unseated). Absent from older servers. */
  stack?: number;
  /** Disconnected but the seat is held until this server time (epoch ms); null otherwise. */
  seatHeldUntil?: number | null;
  /** The seat is released once the current hand ends (stood up, or the hold expired mid-hand). */
  standingUp?: boolean;
  /** Approved rebuy chips that will be added when this player's current hand ends. */
  pendingChips?: number;
}

/** A pending rebuy (extra chips) request. The host decides; the server alone grants chips. */
export interface RebuyRequestView {
  id: string;
  playerId: string;
  nickname: string;
  /** Requested extra chips (positive integer). */
  amount: number;
  /** Requester's current balance (live). */
  stack: number;
  /** Already approved chips waiting for the requester's current hand to end. */
  pendingChips: number;
  /** stack + pendingChips + amount: the balance after approval. */
  expectedStack: number;
  requestedAt: number;
}
/** The viewer's most recent rebuy decision. `applied` = the chips are already in the balance. */
export interface RebuyNotice { requestId: string; amount: number; approved: boolean; applied: boolean; at: number;
  /** Set when the server dropped the request because the room's rebuy limit was lowered below it. */
  reason?: 'limit'; limit?: number }
/** The viewer's seat came back after a reconnect inside the hold (shown until the next hand starts). */
export interface SeatRestoreNotice { seat: number; stack: number; at: number }

/**
 * A pending seat request. The server is the only source of seat assignment.
 * Every member sees pending requests (the seat is reserved); only the host can approve or reject.
 */
export interface SeatRequestView {
  id: string;
  playerId: string;
  nickname: string;
  seat: number;
  /** 'sit' = first seat in this room, 'resit' = had a seat before (stood up, seat hold expired, or rejoined). */
  kind: 'sit' | 'resit';
  /** Requester's current chip balance (kept with the member, not the seat). Display only. */
  stack: number;
  requestedAt: number;
}
/** The viewer's most recent seat decision, so a rejection survives refresh. */
export interface SeatNotice { requestId: string; seat: number; approved: boolean; at: number }

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
  seatRequests?: SeatRequestView[];
  seatNotice?: SeatNotice | null;
  rebuyRequests?: RebuyRequestView[];
  rebuyNotice?: RebuyNotice | null;
  seatRestore?: SeatRestoreNotice | null;
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
  // Seat selection (everyone, host included, picks a seat). The host's own pick is immediate;
  // others wait for host approval. Seat requests never carry chips: rebuy (policy C) will be a
  // separate request with its own approval, so either can be approved without the other.
  | { type: 'requestSeat'; seat: number }
  | { type: 'cancelSeatRequest' }
  | { type: 'resolveSeatRequest'; requestId: string; approve: boolean }
  // Leave the seat but stay in the room as a spectator. Takes effect after the current hand;
  // the chip balance stays with the member. Re-seating needs the host's approval again.
  | { type: 'standUp' }
  // Rebuy (policy C): separate from seat requests. The amount is a request; the server grants it
  // only on the host's approval, once, and applies it after the requester's current hand.
  // clientRequestId (optional UUID) makes a resend idempotent: the same id never grants twice.
  | { type: 'requestRebuy'; amount: number; clientRequestId?: string }
  | { type: 'cancelRebuyRequest' }
  | { type: 'resolveRebuyRequest'; requestId: string; approve: boolean }
  | { type: 'act'; handId: string; revision: number; action: PokerAction; amount?: number };

export { safeCloseReason, logRecord, validConnectionId, transportFailure } from './connectionDiagnostics.ts';

export type ErrorCode = 'INVALID_REQUEST' | 'ROOM_NOT_FOUND' | 'ROOM_FULL'
  | 'AUTH_REQUIRED' | 'AUTH_UNAVAILABLE' | 'NICKNAME_TAKEN' | 'SESSION_EXPIRED' | 'ALREADY_JOINED' | 'RATE_LIMITED' | 'SERVER_FULL' | 'GAME_ERROR'
  | 'SEAT_UNAVAILABLE' | 'SEAT_REQUEST_INVALID' | 'REBUY_REQUEST_INVALID';

export type ServerMessage =
  | { type: 'connection'; serverId: string; connectionId: string }
  | { type: 'pong'; id: number }
  | { type: 'joined'; room: LobbyRoom; playerId: string; token: string }
  | { type: 'room'; room: LobbyRoom }
  | { type: 'left' }
  | { type: 'noRoom'; reason?: 'room-closed' | 'membership-ended' }
  | { type: 'settingsUpdated'; settings: RoomSettings; settingsRevision?: number; requestId?: string }
  | { type: 'error'; code: ErrorCode; message: string; recoverable?: boolean; requestId?: string };
