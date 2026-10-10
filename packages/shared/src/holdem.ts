export type Card = `${number}${'s' | 'h' | 'd' | 'c'}`;
export type PokerAction = 'fold' | 'check' | 'call' | 'raise' | 'allIn';
export interface HandPlayer {
  id: string;
  nickname: string;
  stack: number;
  roundBet: number;
  totalBet: number;
  folded: boolean;
  allIn: boolean;
  cards: Card[] | null;
  revealed: boolean;
}
export interface LegalActions {
  canCheck: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
}
export interface RunoutView {
  phase: 'dealing' | 'squeezing';
  nextStreet: 'flop' | 'turn' | 'river' | 'showdown';
  deadline: number;
  playerId: string | null;
  // Only the selected player receives this card before public river revelation.
  card: Card | null;
}
export interface HoldemView {
  runout?: RunoutView | null;
  id: string;
  number: number;
  revision: number;
  street: 'preflop' | 'flop' | 'turn' | 'river' | 'complete';
  dealerId: string;
  smallBlindId: string;
  bigBlindId: string;
  smallBlind: number;
  bigBlind: number;
  board: Card[];
  players: HandPlayer[];
  pot: number;
  actorId: string | null;
  deadline: number | null;
  legal: LegalActions | null;
  canReveal: boolean;
  lastEvent: string;
  payouts: { playerId: string; amount: number; handName: string }[];
  refunds: { playerId: string; amount: number }[];
  pots: { amount: number; winnerIds: string[] }[];
}
