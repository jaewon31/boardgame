import { memo } from 'react';
import Svg, { Circle, Defs, G, Path, Pattern, Rect, Text as SvgText } from 'react-native-svg';
import type { Card } from '@boardgame/shared';

const ink = '#152536';
const red = '#B72635';
const gold = '#C79A45';
const suitPaths: Record<string, string> = {
  h: 'M0 9C-5 5-13-1-10-7C-8-12-2-11 0-6C2-11 8-12 10-7C13-1 5 5 0 9Z',
  s: 'M0-11C-3-6-12-2-10 4C-8 10-2 8 0 4C0 7-1 9-4 11H4C1 9 0 7 0 4C2 8 8 10 10 4C12-2 3-6 0-11Z',
  d: 'M0-12L8 0L0 12L-8 0Z',
  c: 'M0-3C-7-2-7-13 0-12C7-13 7-2 0-3C4-9 13-3 9 3C6 8 1 5 0 2C0 6 1 9 4 11H-4C-1 9 0 6 0 2C-1 5-6 8-9 3C-13-3-4-9 0-3Z',
};
function Suit({ suit, x, y, size = 12, inverted = false }: { suit: string; x: number; y: number; size?: number; inverted?: boolean }) {
  return <G transform={`translate(${x} ${y}) rotate(${inverted ? 180 : 0}) scale(${size / 24})`}><Path d={suitPaths[suit]} fill={suit === 'h' || suit === 'd' ? red : ink} /></G>;
}
const pips: Record<number, [number, number][]> = {
  2: [[50, 35], [50, 105]], 3: [[50, 35], [50, 70], [50, 105]],
  4: [[33, 35], [67, 35], [33, 105], [67, 105]],
  5: [[33, 35], [67, 35], [50, 70], [33, 105], [67, 105]],
  6: [[33, 35], [67, 35], [33, 70], [67, 70], [33, 105], [67, 105]],
  7: [[33, 35], [67, 35], [50, 52], [33, 70], [67, 70], [33, 105], [67, 105]],
  8: [[33, 35], [67, 35], [50, 52], [33, 70], [67, 70], [50, 88], [33, 105], [67, 105]],
  9: [[33, 31], [67, 31], [33, 57], [67, 57], [50, 70], [33, 83], [67, 83], [33, 109], [67, 109]],
  10: [[33, 31], [67, 31], [50, 44], [33, 57], [67, 57], [33, 83], [67, 83], [50, 96], [33, 109], [67, 109]],
};

// Original vector court illustration, mirrored like a two-way poker deck.
function Court({ rank, suit }: { rank: number; suit: string }) {
  return <G>
    <Rect x={24} y={25} width={52} height={90} fill="#F4E7BF" stroke={ink} strokeWidth={.8} />
    {[0, 180].map(angle => <G key={angle} transform={`translate(50 70) rotate(${angle})`}>
      <Path d="M-25 0L-22-13L-8-20H8L22-12L25 0Z" fill={red} stroke={ink} strokeWidth={.6} />
      <Path d="M-20-12L-9-17L10 0H-3Z" fill="#254C79" stroke={ink} strokeWidth={.7} />
      <Path d="M13-19L21-9L9 0H1Z" fill={gold} stroke={ink} strokeWidth={.6} />
      <Path d="M-8-34Q-13-25-6-17L4-16L10-21L8-34Z" fill="#F8D9AD" stroke={ink} strokeWidth={.8} />
      <Path d={rank === 12 ? 'M-9-35Q-17-25-11-16L-5-18Q-11-26-5-32L8-31L10-22L13-26L10-36Z' : 'M-9-33L-10-25L-6-27L-5-32L8-31L10-24L12-28L9-35Z'} fill={ink} />
      <Path d={rank === 11 ? 'M-12-36Q0-45 12-35L8-31H-9Z' : 'M-11-34L-14-42L-5-38L0-45L5-38L13-42L10-34Z'} fill={gold} stroke={ink} strokeWidth={.7} />
      <Path d="M-3-27H0M5-27H8M3-27L2-23H5M0-20Q4-18 7-21" fill="none" stroke={ink} strokeWidth={.7} />
      {rank === 13 && <Path d="M-6-21Q0-14 7-21L3-13L-3-15Z" fill={ink} />}
      <Path d="M-22-3L-14-9M-17 0L-9-7M13-7L18-2" stroke={gold} strokeWidth={1.4} />
      <Path d="M18-15V-40M15-34H21" stroke={ink} strokeWidth={1} />
      {rank === 12 ? <G><Circle cx={18} cy={-38} r={3} fill={red} /><Circle cx={18} cy={-38} r={1} fill={gold} /></G> : <Path d="M18-44L16-37H20Z" fill={gold} stroke={ink} strokeWidth={.5} />}
      <Suit suit={suit} x={-18} y={-27} size={9} />
    </G>)}
  </G>;
}

export function CardDrawing({ card, back = false, compact = false }: { card?: Card; back?: boolean; compact?: boolean }) {
  const rank = Number(card?.slice(0, -1));
  const suit = card?.slice(-1) ?? 's';
  const label = ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[rank] ?? String(rank);
  const color = suit === 'h' || suit === 'd' ? red : ink;
  if (back || !card) return <G>
    <Defs><Pattern id="weave" width={8} height={8} patternUnits="userSpaceOnUse"><Path d="M4 0L8 4L4 8L0 4Z" fill="none" stroke="#ABC1DA" strokeWidth={.45} /><Circle cx={4} cy={4} r={.65} fill="#B8CBE0" /></Pattern></Defs>
    <Rect x={.5} y={.5} width={99} height={139} rx={6} fill="#FFFDF7" stroke="#CBBFAD" />
    <Rect x={5} y={5} width={90} height={130} rx={3} fill="#17375D" />
    <Rect x={8} y={8} width={84} height={124} rx={2} fill="url(#weave)" stroke="#CCD8E6" strokeWidth={.8} />
    <Path d="M50 38L70 70L50 102L30 70Z" fill="#17375D" stroke="#CDDCEE" strokeWidth={1.3} />
    <Path d="M50 53L61 70L50 87L39 70Z" fill="none" stroke="#CDDCEE" strokeWidth={.7} />
    <Circle cx={50} cy={70} r={4} fill="#CDDCEE" />
  </G>;
  return <G>
    <Rect x={.5} y={.5} width={99} height={139} rx={6} fill="#FFFDF7" stroke="#CBBFAD" />
    {[0, 180].map(angle => <G key={angle} transform={angle ? 'rotate(180 50 70)' : undefined}>
      <SvgText x={compact ? 14 : 11} y={compact ? 24 : 17} textAnchor="middle" fontFamily="serif" fontWeight="700" fontSize={compact ? (rank === 10 ? 22 : 26) : rank === 10 ? 13 : 16} fill={color}>{label}</SvgText>
      <Suit suit={suit} x={compact ? 14 : 11} y={compact ? 35 : 26} size={compact ? 16 : 12} />
    </G>)}
    <G transform={compact ? 'translate(15 21) scale(.7)' : undefined}>{rank === 14 ? <Suit suit={suit} x={50} y={70} size={suit === 's' ? 44 : 32} /> : rank >= 11 ? <Court rank={rank} suit={suit} /> : pips[rank]?.map(([x, y], i) => <Suit key={i} suit={suit} x={x} y={y} size={19} inverted={y > 70} />)}</G>
  </G>;
}
export const CardArtwork = memo(function CardArtwork({ card, back, width }: { card?: Card; back?: boolean; width: number }) {
  return <Svg width={width} height={width * 1.4} viewBox="0 0 100 140"><CardDrawing card={card} back={back} compact={width < 80} /></Svg>;
});
