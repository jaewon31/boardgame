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
}
export interface LegalActions {
  canCheck: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
}
export interface HoldemView {
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
  lastEvent: string;
  payouts: { playerId: string; amount: number; handName: string }[];
  refunds: { playerId: string; amount: number }[];
  pots: { amount: number; winnerIds: string[] }[];
}
