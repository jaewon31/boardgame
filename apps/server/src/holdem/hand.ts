import { randomUUID } from 'node:crypto';
import type { Card, HoldemView, LegalActions, PokerAction } from '@boardgame/shared';
import { evaluate, newDeck, shuffledDeck } from './cards.ts';

interface Seat {
  id: string;
  nickname: string;
  stack: number;
  hole: Card[];
  roundBet: number;
  totalBet: number;
  folded: boolean;
  actedAt: number | null;
}
export interface PlayerSeed { id: string; nickname: string; stack: number }
interface Options { smallBlind?: number; bigBlind?: number; runoutMs?: number; riverSqueezeMs?: number; dealerIndex?: number; deck?: Card[]; turnMs?: number; number?: number }

export class HoldemHand {
  private initialStacks: Record<string,number> = {};
  private reviewEvents: import('@boardgame/shared').HandReviewEvent[] = [];
  private recordReview(text: string) {
    this.reviewEvents.push({street:this.street, text, board:[...this.board], pot:this.players.reduce((sum,p)=>sum+p.totalBet,0)});
    if(this.reviewEvents.length > 150) this.reviewEvents.splice(1,1);
  }
  reviewFor(id: string): import('@boardgame/shared').HandReview {
    if(!this.complete) throw new Error('완료된 핸드만 복기할 수 있어요.');
    return {netChips:Object.fromEntries(this.players.filter(p=>this.initialStacks[p.id]!==undefined).map(p=>[p.id,p.stack-this.initialStacks[p.id]])), hand:this.viewFor(id), events:structuredClone(this.reviewEvents)};
  }
  readonly id = randomUUID();
  readonly number: number;
  readonly players: Seat[];
  readonly dealerIndex: number;
  readonly smallBlindIndex: number;
  readonly bigBlindIndex: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  private deck: Card[];
  private turnMs: number;
  private runoutMs: number;
  private riverSqueezeMs: number;
  private runout: NonNullable<HoldemView['runout']> | null = null;
  private board: Card[] = [];
  private currentBet = 20;
  private fullRaise = 20;
  private street: HoldemView['street'] = 'preflop';
  private actorIndex = -1;
  private showdown = false;
  private revealed = new Set<string>();
  // Ephemeral presentation metadata; intentionally excluded from checkpoints.
  private audioAction?: HoldemView['audioAction'];
  revision = 0;
  deadline: number | null = null;
  private lastEvent = '개인 패를 배분하고 블라인드를 냈습니다.';
  private payouts: HoldemView['payouts'] = [];
  private refunds: HoldemView['refunds'] = [];
  private pots: HoldemView['pots'] = [];

  constructor(seeds: PlayerSeed[], options: Options = {}) {
    if (seeds.length < 2 || seeds.length > 6 || new Set(seeds.map(p => p.id)).size !== seeds.length
      || seeds.some(p => !Number.isSafeInteger(p.stack) || p.stack <= 0 || p.stack > 1_000_000)) throw new Error('칩이 있는 참가자 2~6명이 필요합니다.');
    this.smallBlind = options.smallBlind ?? 10;
    this.bigBlind = options.bigBlind ?? 20;
    if (!Number.isSafeInteger(this.smallBlind) || !Number.isSafeInteger(this.bigBlind) || this.smallBlind < 1 || this.bigBlind <= this.smallBlind || this.bigBlind > 10000) throw new Error('Invalid blinds');
    this.currentBet = this.bigBlind;
    this.fullRaise = this.bigBlind;
    this.deck = options.deck ? [...options.deck] : shuffledDeck();
    const valid = new Set(newDeck());
    if (this.deck.length !== 52 || new Set(this.deck).size !== 52 || this.deck.some(c => !valid.has(c))) throw new Error('Invalid deck');
    this.dealerIndex = options.dealerIndex ?? 0;
    if (!Number.isInteger(this.dealerIndex) || this.dealerIndex < 0 || this.dealerIndex >= seeds.length) throw new Error('Invalid dealer');
    this.turnMs = options.turnMs ?? 30_000;
    this.runoutMs = options.runoutMs ?? 2_000;
    this.riverSqueezeMs = options.riverSqueezeMs ?? 15_000;
    this.number = options.number ?? 1;
    this.initialStacks = Object.fromEntries(seeds.map(p=>[p.id,p.stack]));
    this.players = seeds.map(p => ({ ...p, hole: [], roundBet: 0, totalBet: 0, folded: false, actedAt: null }));
    this.smallBlindIndex = seeds.length === 2 ? this.dealerIndex : this.next(this.dealerIndex);
    this.bigBlindIndex = this.next(this.smallBlindIndex);
    for (let round = 0; round < 2; round++) {
      for (let i = 1; i <= this.players.length; i++) this.players[(this.dealerIndex + i) % this.players.length].hole.push(this.draw());
    }
    this.pay(this.players[this.smallBlindIndex], Math.min(this.smallBlind, this.players[this.smallBlindIndex].stack));
    this.pay(this.players[this.bigBlindIndex], Math.min(this.bigBlind, this.players[this.bigBlindIndex].stack));
    this.recordReview(`블라인드 ${this.smallBlind}/${this.bigBlind} · 개인 패 배분`);
    this.advance(this.bigBlindIndex);
  }

  // Server-only durable state. Never send this object to a client.
  checkpoint() {
    return structuredClone({ initialStacks:this.initialStacks, reviewEvents: this.reviewEvents, version: 1 as const, id: this.id, number: this.number, players: this.players, dealerIndex: this.dealerIndex, smallBlindIndex: this.smallBlindIndex, bigBlindIndex: this.bigBlindIndex, smallBlind: this.smallBlind, bigBlind: this.bigBlind, deck: this.deck, turnMs: this.turnMs, runoutMs: this.runoutMs, riverSqueezeMs: this.riverSqueezeMs, runout: this.runout, board: this.board, currentBet: this.currentBet, fullRaise: this.fullRaise, street: this.street, actorIndex: this.actorIndex, showdown: this.showdown, revision: this.revision, deadline: this.deadline, lastEvent: this.lastEvent, payouts: this.payouts, refunds: this.refunds, pots: this.pots, revealed: [...this.revealed] });
  }
  static restore(saved: ReturnType<HoldemHand['checkpoint']>) {
    if (saved.version !== 1 || !Array.isArray(saved.players) || saved.players.length < 2 || saved.players.length > 6
      || !Array.isArray(saved.deck) || !Array.isArray(saved.board) || !Array.isArray(saved.revealed)
      || !Number.isSafeInteger(saved.revision) || typeof saved.id !== 'string') throw new Error('Invalid hand checkpoint');
    const hand = Object.create(HoldemHand.prototype) as HoldemHand;
    Object.assign(hand, structuredClone({ id: saved.id, number: saved.number, players: saved.players, dealerIndex: saved.dealerIndex, smallBlindIndex: saved.smallBlindIndex, bigBlindIndex: saved.bigBlindIndex, smallBlind: saved.smallBlind, bigBlind: saved.bigBlind, deck: saved.deck, turnMs: saved.turnMs, runoutMs: saved.runoutMs, riverSqueezeMs: saved.riverSqueezeMs, runout: saved.runout, board: saved.board, currentBet: saved.currentBet, fullRaise: saved.fullRaise, street: saved.street, actorIndex: saved.actorIndex, showdown: saved.showdown, revision: saved.revision, deadline: saved.deadline, lastEvent: saved.lastEvent, payouts: saved.payouts, refunds: saved.refunds, pots: saved.pots }));
    hand.initialStacks = structuredClone(saved.initialStacks ?? {});
    hand.reviewEvents = structuredClone(saved.reviewEvents ?? []);
    hand.revealed = new Set(saved.revealed);
    if (hand.runout) hand.exposeAllInHands();
    return hand;
  }
  recoverClock(now: number) {
    if (this.complete) return;
    this.deadline = now + (this.runout ? 30_000 : this.turnMs);
    if (this.runout) this.runout.deadline = this.deadline;
  }

  get complete() { return this.street === 'complete'; }
  get actorId() { return this.actorIndex < 0 ? null : this.players[this.actorIndex].id; }
  private next(index: number) { return (index + 1) % this.players.length; }
  private draw() { const card = this.deck.shift(); if (!card) throw new Error('Empty deck'); return card; }
  private live() { return this.players.filter(p => !p.folded); }
  private pay(player: Seat, amount: number) { player.stack -= amount; player.roundBet += amount; player.totalBet += amount; }
  private targetBet() {
    const active = this.live().filter(p => p.stack > 0);
    // No full blind needs to be completed when the sole opponent is already all-in for less.
    return active.length <= 1 ? Math.max(...this.live().map(p => p.roundBet)) : this.currentBet;
  }
  legalFor(id: string): LegalActions | null {
    if (this.complete || this.actorId !== id) return null;
    const p = this.players[this.actorIndex];
    const target = this.targetBet();
    const owed = Math.max(0, target - p.roundBet);
    const reopened = p.actedAt === null || p.actedAt === 0 || this.currentBet - p.actedAt >= this.fullRaise;
    const opponentCanBet = this.live().some(other => other !== p && other.stack > 0);
    const canRaise = reopened && opponentCanBet && p.stack > owed;
    const maxRaiseTo = p.roundBet + p.stack;
    return {
      canCheck: owed === 0, callAmount: Math.min(owed, p.stack), canRaise,
      minRaiseTo: this.currentBet < this.bigBlind ? this.bigBlind : this.currentBet + this.fullRaise,
      maxRaiseTo, canAllIn: p.stack <= owed || canRaise,
    };
  }

  act(id: string, action: PokerAction, amount?: number) {
    const legal = this.legalFor(id);
    if (!legal) throw new Error('지금은 내 차례가 아닙니다.');
    const p = this.players[this.actorIndex];
    const index = this.actorIndex;
    const previousBet = this.currentBet;
    if (action === 'fold') {
      p.folded = true;
      this.lastEvent = `${p.nickname}: 폴드`;
    } else if (action === 'check') {
      if (!legal.canCheck) throw new Error('콜할 금액이 있어 체크할 수 없습니다.');
      p.actedAt = this.currentBet;
      this.lastEvent = `${p.nickname}: 체크`;
    } else if (action === 'call') {
      if (legal.canCheck) throw new Error('콜할 금액이 없습니다. 체크해 주세요.');
      this.pay(p, legal.callAmount);
      p.actedAt = this.currentBet;
      this.lastEvent = `${p.nickname}: ${legal.callAmount} 콜${p.stack === 0 ? ' (올인)' : ''}`;
    } else {
      if (action !== 'raise' && action !== 'allIn') throw new Error('알 수 없는 행동입니다.');
      if (action === 'allIn' && !legal.canAllIn) throw new Error('지금은 올인 레이즈가 허용되지 않습니다.');
      const to = action === 'allIn' ? legal.maxRaiseTo : amount;
      if (to === undefined || !Number.isSafeInteger(to) || to <= p.roundBet || to > legal.maxRaiseTo) throw new Error('보유 칩 이내의 정수 금액을 입력해 주세요.');
      if (to <= this.currentBet && action === 'allIn') {
        this.pay(p, p.stack);
      } else {
        if (!legal.canRaise) throw new Error('이번 행동에서는 레이즈할 수 없습니다.');
        if (to < legal.minRaiseTo && to !== legal.maxRaiseTo) throw new Error(`최소 ${legal.minRaiseTo}까지 올려야 합니다.`);
        if (to <= this.currentBet) throw new Error('현재 베팅보다 높게 올려 주세요.');
        const increment = to - this.currentBet;
        const full = to >= legal.minRaiseTo;
        this.pay(p, to - p.roundBet);
        if (full) this.fullRaise = this.currentBet < this.bigBlind ? to : increment;
        this.currentBet = to;
      }
      p.actedAt = this.currentBet;
      this.lastEvent = `${p.nickname}: ${p.roundBet}까지 ${p.stack === 0 ? '올인' : '레이즈'}`;
    }
    this.recordReview(this.lastEvent);
    this.revision++;
    this.audioAction = { revision: this.revision, kind: action === 'fold' || action === 'check' || action === 'call'
      ? action : p.roundBet <= previousBet ? 'call' : previousBet === 0 ? 'bet' : 'raise' };
    this.advance(index);
  }

  timeout() {
    if (this.runout) { this.advanceRunout(); return; }
    if (!this.actorId) return;
    const id = this.actorId;
    this.act(id, this.legalFor(id)!.canCheck ? 'check' : 'fold');
    const event = [...this.reviewEvents].reverse().find(e => e.text.startsWith(this.players.find(p=>p.id===id)!.nickname + ':'));
    if(event) event.text = '시간 초과 · ' + event.text;
    this.lastEvent = `시간 초과 · ${this.lastEvent}`;
  }

  depart(id: string) {
    // Once betting is locked, every live hand keeps showdown eligibility.
    if (this.runout) {
      if (this.runout.phase === 'squeezing' && this.runout.playerId === id) this.publishRiver();
      return;
    }
    const index = this.players.findIndex(p => p.id === id);
    const p = this.players[index];
    if (!p || this.complete || p.folded || p.stack === 0) return; // All-in hands remain eligible.
    p.folded = true;
    this.lastEvent = `${p.nickname}: 퇴장으로 폴드`;
    this.recordReview(this.lastEvent);
    this.revision++;
    this.audioAction = { revision: this.revision, kind: 'fold' };
    // Preserve the current actor when somebody else leaves out of turn.
    this.advance(index === this.actorIndex ? index : (this.actorIndex - 1 + this.players.length) % this.players.length);
  }

  private advance(after: number) {
    if (this.live().length === 1) { this.finish(false); return; }
    const active = this.live().filter(p => p.stack > 0);
    const need = active.filter(p => p.actedAt === null || p.roundBet < this.targetBet());
    const aloneMatched = active.length <= 1 && (active.length === 0 || active[0].roundBet >= this.targetBet());
    if (!aloneMatched && need.length > 0) {
      for (let i = 1; i <= this.players.length; i++) {
        const index = (after + i) % this.players.length;
        if (need.includes(this.players[index])) {
          // Don't extend another player's clock due to an out-of-turn departure.
          if (this.actorIndex !== index || this.deadline === null) this.deadline = Date.now() + this.turnMs;
          this.actorIndex = index;
          return;
        }
      }
    }
    this.actorIndex = -1;
    this.deadline = null;
    if (this.street === 'river') { this.finish(true); return; }
    if (aloneMatched) { this.queueRunout(); return; }
    this.draw(); // burn
    if (this.street === 'preflop') { this.board.push(this.draw(), this.draw(), this.draw()); this.street = 'flop'; }
    else { this.board.push(this.draw()); this.street = this.street === 'flop' ? 'turn' : 'river'; }
    for (const p of this.players) { p.roundBet = 0; p.actedAt = null; }
    this.currentBet = 0;
    this.fullRaise = this.bigBlind;
    this.recordReview('공용 카드 공개');
    this.advance(this.dealerIndex);
  }

  private exposeAllInHands() {
    const live = this.live();
    if (live.length < 2 || !live.some(p => p.stack === 0)) return;
    const newlyExposed = live.some(p => !this.revealed.has(p.id));
    for (const p of live) this.revealed.add(p.id);
    if (newlyExposed) this.recordReview('올인 베팅 종료 · 참가자 패 모두 공개');
  }
  private queueRunout() {
    this.exposeAllInHands();
    const nextStreet = this.street === 'preflop' ? 'flop' : this.street === 'flop' ? 'turn' : this.street === 'turn' ? 'river' : 'showdown';
    this.actorIndex = -1;
    this.deadline = Date.now() + this.runoutMs;
    this.runout = { phase: 'dealing', nextStreet, deadline: this.deadline, playerId: null, card: null };
    this.lastEvent = nextStreet === 'showdown' ? '리버 공개 · 결과를 확인합니다.' : '베팅 종료 · 공용 카드를 차례로 공개합니다.';
  }
  private advanceRunout() {
    const pending = this.runout!;
    if (pending.phase === 'squeezing') { this.publishRiver(); return; }
    if (pending.nextStreet === 'showdown') { this.revision++; this.finish(true); return; }
    this.draw(); // Exactly one burn for each street, including the privately held river.
    if (pending.nextStreet === 'river') {
      const river = this.draw();
      const scores = this.live().map(p => ({ player: p, score: evaluate([...p.hole, ...this.board]).score }));
      const best = Math.max(...scores.map(p => p.score));
      // Use the TURN board only. Never select based on the hidden river or final result.
      const trailing = scores.filter(p => p.score < best).sort((a,b) => this.distance(a.player) - this.distance(b.player));
      if (trailing.length) {
        this.deadline = Date.now() + this.riverSqueezeMs;
        this.runout = { phase: 'squeezing', nextStreet: 'river', deadline: this.deadline, playerId: trailing[0].player.id, card: river };
        this.lastEvent = trailing[0].player.nickname + '님이 리버 카드를 확인하고 있어요.';
        this.revision++;
        return;
      }
      this.board.push(river);
      this.street = 'river';
    } else if (pending.nextStreet === 'flop') {
      this.board.push(this.draw(), this.draw(), this.draw()); this.street = 'flop';
    } else { this.board.push(this.draw()); this.street = 'turn'; }
    for (const p of this.players) { p.roundBet = 0; p.actedAt = null; }
    this.currentBet = 0;
    this.fullRaise = this.bigBlind;
    this.recordReview('공용 카드 공개');
    this.revision++;
    this.queueRunout();
  }
  revealRiver(id: string) {
    if (this.runout?.phase !== 'squeezing' || this.runout.playerId !== id) throw new Error('지정된 플레이어만 이번 리버를 공개할 수 있어요.');
    this.publishRiver();
  }
  private publishRiver() {
    if (this.runout?.phase !== 'squeezing' || !this.runout.card) return;
    this.board.push(this.runout.card);
    this.street = 'river';
    this.recordReview('리버 공개');
    for (const p of this.players) p.roundBet = 0;
    this.revision++;
    this.queueRunout();
  }
  skipDisconnectedSqueeze(connectedIds: string[]) {
    if (this.runout?.phase === 'squeezing' && !connectedIds.includes(this.runout.playerId!)) this.publishRiver();
  }

  private finish(showdown: boolean) {
    if (showdown) this.exposeAllInHands();
    this.runout = null;
    this.showdown = showdown;
    this.street = 'complete';
    this.actorIndex = -1;
    this.deadline = null;
    // Return an unmatched overbet before building main/side pots, including fold wins.
    const ordered = [...this.players].sort((a, b) => b.totalBet - a.totalBet);
    const excess = ordered[0].totalBet - ordered[1].totalBet;
    if (excess > 0) {
      ordered[0].totalBet -= excess;
      ordered[0].roundBet = Math.max(0, ordered[0].roundBet - excess);
      ordered[0].stack += excess;
      this.refunds.push({ playerId: ordered[0].id, amount: excess });
    }
    const levels = [...new Set(this.players.map(p => p.totalBet).filter(v => v > 0))].sort((a, b) => a - b);
    const scores = new Map(this.live().map(p => [p.id, showdown ? evaluate([...p.hole, ...this.board]) : { score: 0, name: '상대 폴드' }]));
    let previous = 0;
    for (const level of levels) {
      const contributors = this.players.filter(p => p.totalBet >= level);
      const amount = (level - previous) * contributors.length;
      const eligible = contributors.filter(p => !p.folded);
      if (!eligible.length) {
        // Only possible when all eligible side-pot players explicitly abandon the hand.
        for (const p of contributors) { p.stack += level - previous; this.refunds.push({ playerId: p.id, amount: level - previous }); }
        previous = level;
        continue;
      }
      const best = Math.max(...eligible.map(p => scores.get(p.id)!.score));
      const winners = eligible.filter(p => scores.get(p.id)!.score === best);
      // Odd chips go clockwise from the button; suits never break ties.
      winners.sort((a, b) => this.distance(a) - this.distance(b));
      this.pots.push({ amount, winnerIds: winners.map(p => p.id) });
      winners.forEach((p, index) => {
        const award = Math.floor(amount / winners.length) + (index < amount % winners.length ? 1 : 0);
        p.stack += award;
        const existing = this.payouts.find(result => result.playerId === p.id);
        if (existing) existing.amount += award;
        else this.payouts.push({ playerId: p.id, amount: award, handName: scores.get(p.id)!.name });
      });
      previous = level;
    }
    this.recordReview('핸드 종료 · 결과 확정');
  }
  private distance(p: Seat) { return (this.players.indexOf(p) - this.dealerIndex - 1 + this.players.length) % this.players.length; }

  canReveal(id: string) {
    const player = this.players.find(p => p.id === id);
    return this.complete && this.showdown && !!player && !player.folded && !this.isRevealed(id);
  }
  private isRevealed(id: string) {
    return this.revealed.has(id) || (this.showdown && this.payouts.some(p => p.playerId === id));
  }
  revealCards(id: string) {
    if (this.isRevealed(id)) return;
    if (!this.canReveal(id)) throw new Error('쇼다운에 참여한 자신의 패만 공개할 수 있어요.');
    this.revealed.add(id);
    this.revision++;
    this.lastEvent = this.players.find(p => p.id === id)!.nickname + ': 패 공개';
  }

  viewFor(id: string, includeAudio = false): HoldemView {
    return {
      id: this.id, number: this.number, revision: this.revision, street: this.street,
      ...(includeAudio && this.audioAction ? { audioAction: { ...this.audioAction } } : {}),
      dealerId: this.players[this.dealerIndex].id, smallBlindId: this.players[this.smallBlindIndex].id,
      bigBlindId: this.players[this.bigBlindIndex].id, smallBlind: this.smallBlind, bigBlind: this.bigBlind,
      board: [...this.board], actorId: this.actorId, deadline: this.deadline, legal: this.legalFor(id),
      canReveal: this.canReveal(id),
      runout: this.runout ? { ...this.runout, card: this.runout.playerId === id ? this.runout.card : null } : null,
      pot: this.players.reduce((sum, p) => sum + p.totalBet, 0), lastEvent: this.lastEvent,
      players: this.players.map(p => ({ id: p.id, nickname: p.nickname, stack: p.stack, roundBet: p.roundBet,
        totalBet: p.totalBet, folded: p.folded, allIn: p.stack === 0 && !p.folded,
        revealed: this.isRevealed(p.id),
        cards: p.id === id || this.isRevealed(p.id) ? [...p.hole] : null })),
      payouts: this.payouts.map(p => ({ ...p })), refunds: this.refunds.map(p => ({ ...p })),
      pots: this.pots.map(p => ({ ...p, winnerIds: [...p.winnerIds] })),
    };
  }
}
