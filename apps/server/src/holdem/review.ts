import type { Card, HandReview } from '@boardgame/shared';
import type { HoldemHand } from './hand.ts';
// Server-only private cards are never spread into a response.
export interface SavedReview { public: HandReview; ownCards: Record<string, Card[]> }
export function saveReview(hand: HoldemHand): SavedReview {
  return {public:hand.reviewFor(''), ownCards:Object.fromEntries(hand.players.map(p=>[p.id,[...p.hole]]))};
}
export function reviewFor(saved: SavedReview, viewer: string): HandReview {
  const result = structuredClone(saved.public);
  result.hand.players = result.hand.players.map(p=>({...p,cards:p.id===viewer ? saved.ownCards[viewer] ?? p.cards : p.cards}));
  return result;
}
