import { randomInt } from 'node:crypto';
import type { Card } from '@boardgame/shared';

export function newDeck(): Card[] {
  return ['s', 'h', 'd', 'c'].flatMap(s => Array.from({ length: 13 }, (_, i) => `${i + 2}${s}` as Card));
}
export function shuffledDeck(): Card[] {
  const deck = newDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
const names = ['하이 카드', '원 페어', '투 페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'];

function five(cards: Card[]) {
  const ranks = cards.map(c => Number(c.slice(0, -1))).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every(c => c.slice(-1) === cards[0].slice(-1));
  const straight = counts.size === 5 && ranks[0] - ranks[4] === 4 ? ranks[0]
    : ranks.join(',') === '14,5,4,3,2' ? 5 : 0;
  let values: number[];
  if (flush && straight) values = [8, straight];
  else if (groups[0][1] === 4) values = [7, groups[0][0], groups[1][0]];
  else if (groups[0][1] === 3 && groups[1][1] === 2) values = [6, groups[0][0], groups[1][0]];
  else if (flush) values = [5, ...ranks];
  else if (straight) values = [4, straight];
  else if (groups[0][1] === 3) values = [3, ...groups.map(g => g[0])];
  else if (groups[0][1] === 2 && groups[1][1] === 2) values = [2, ...groups.map(g => g[0])];
  else if (groups[0][1] === 2) values = [1, ...groups.map(g => g[0])];
  else values = [0, ...ranks];
  const category = values[0];
  while (values.length < 6) values.push(0);
  return { score: values.reduce((score, value) => score * 15 + value, 0), name: names[category] };
}

export function evaluate(cards: Card[]) {
  if (cards.length < 5 || cards.length > 7 || new Set(cards).size !== cards.length) throw new Error('Expected 5 to 7 distinct cards');
  let best = { score: -1, name: '' };
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const result = five([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (result.score > best.score) best = result;
          }
  return best;
}
