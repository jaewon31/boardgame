import { randomUUID } from 'node:crypto';
import type { ErrorCode, SeatNotice, SeatRequestView } from '@boardgame/shared';

/**
 * Seat assignment and the host's seat approval, kept apart from chips.
 *
 * This module never reads or writes chip balances except to *display* the requester's
 * current balance. A future rebuy flow (policy C) must live in its own module with its own
 * request queue, message types and host decision, so that:
 *  - approving a seat never grants chips, and granting chips never moves a seat;
 *  - each decision is single-use within its own queue (no double seat / no double grant);
 *  - a re-seat can be approved with the existing balance while a rebuy is still pending or rejected.
 */
export const SEAT_COUNT = 6;

export interface SeatMember {
  id: string;
  nickname: string;
  /** Chip balance (owned by the member, not the seat). Read-only here. */
  stack: number;
  /** Fixed seat 0..SEAT_COUNT-1; null = in the room but not seated. */
  seat: number | null;
  /** Held a seat in this room before; the next request is a re-seat. */
  seatedBefore?: boolean;
  /** Last decision on this member's request (shown only to them; survives refresh). */
  seatNotice?: SeatNotice;
  /** Disconnected: the seat is held for the same account until this time (server clock, epoch ms). */
  seatHeldUntil?: number;
  /**
   * The seat is released once the current hand is over. 'voluntary' = stood up,
   * 'expired' = the disconnect hold ran out while the member was still in a hand.
   */
  standPending?: 'voluntary' | 'expired';
}
/** Pending seat request: at most one per member and one per seat (the seat is reserved). */
export interface SeatRequest {
  id: string;
  playerId: string;
  seat: number;
  kind: 'sit' | 'resit';
  /** Balance when requested (audit only; views show the live balance). */
  stack: number;
  requestedAt: number;
}
export interface SeatRoom {
  hostId: string;
  players: SeatMember[];
  seatRequests: SeatRequest[];
  /** Legacy counter, kept meaningful for older checkpoint readers. */
  nextSeat: number;
}
export type SeatResult = { ok: true } | { ok: false; code: ErrorCode; message: string; changed?: boolean };
const refuse = (code: ErrorCode, message: string, changed = false): SeatResult => ({ ok: false, code, message, changed });

export const seatedMembers = <T extends SeatMember>(players: T[]) => players.filter(p => p.seat !== null);
export const seatOccupied = (room: SeatRoom, seat: number) => room.players.some(p => p.seat === seat);
export const seatReserved = (room: SeatRoom, seat: number) => room.seatRequests.some(r => r.seat === seat);
export function freeSeat(room: SeatRoom): number | null {
  for (let seat = 0; seat < SEAT_COUNT; seat++) if (!seatOccupied(room, seat) && !seatReserved(room, seat)) return seat;
  return null;
}
export function takeSeat(room: SeatRoom, member: SeatMember, seat: number) {
  member.seat = seat;
  member.seatedBefore = true;
  room.nextSeat = Math.max(room.nextSeat, seat + 1);
}

/** The host sits immediately; anyone else queues a request for the host. */
export function requestSeat(room: SeatRoom, member: SeatMember, seat: number, now = Date.now()): SeatResult {
  if (member.seat !== null) return refuse('SEAT_REQUEST_INVALID', '이미 자리에 앉아 있어요.');
  if (room.seatRequests.some(r => r.playerId === member.id)) return refuse('SEAT_REQUEST_INVALID', '이미 착석 승인을 기다리고 있어요. 요청을 취소한 뒤 다시 선택해 주세요.');
  if (seatOccupied(room, seat)) return refuse('SEAT_UNAVAILABLE', '이미 다른 친구가 앉은 자리예요. 다른 빈자리를 선택해 주세요.');
  if (seatReserved(room, seat)) return refuse('SEAT_UNAVAILABLE', '다른 친구가 먼저 요청한 자리예요. 다른 빈자리를 선택해 주세요.');
  member.seatNotice = undefined;
  if (room.hostId === member.id) takeSeat(room, member, seat);
  else room.seatRequests.push({ id: randomUUID(), playerId: member.id, seat, kind: member.seatedBefore ? 'resit' : 'sit', stack: member.stack, requestedAt: now });
  return { ok: true };
}
export function cancelSeatRequest(room: SeatRoom, member: SeatMember): SeatResult {
  const before = room.seatRequests.length;
  room.seatRequests = room.seatRequests.filter(r => r.playerId !== member.id);
  return room.seatRequests.length === before ? refuse('SEAT_REQUEST_INVALID', '취소할 착석 요청이 없어요.') : { ok: true };
}
/**
 * Host decision. The request is removed before anything else, so a decision applies once.
 * `changed` on a refusal means state still changed (stale request dropped) and must be broadcast.
 */
export function resolveSeatRequest(room: SeatRoom, decider: SeatMember, requestId: string, approve: boolean, now = Date.now()): SeatResult {
  if (room.hostId !== decider.id) return refuse('SEAT_REQUEST_INVALID', '방장만 착석 요청을 승인하거나 거절할 수 있어요.');
  const request = room.seatRequests.find(r => r.id === requestId);
  if (!request) return refuse('SEAT_REQUEST_INVALID', '이미 처리됐거나 취소된 요청이에요.');
  room.seatRequests = room.seatRequests.filter(r => r !== request);
  const requester = room.players.find(p => p.id === request.playerId);
  if (!requester) return refuse('SEAT_REQUEST_INVALID', '요청한 친구가 방을 나갔어요.', true);
  if (approve && (requester.seat !== null || seatOccupied(room, request.seat))) {
    requester.seatNotice = { requestId: request.id, seat: request.seat, approved: false, at: now };
    return refuse('SEAT_UNAVAILABLE', '이미 다른 친구가 앉은 자리라 승인할 수 없어요.', true);
  }
  // Seats approved mid-hand take effect from the next hand: only seated players are dealt in.
  if (approve) takeSeat(room, requester, request.seat);
  requester.seatNotice = { requestId: request.id, seat: request.seat, approved: approve, at: now };
  return { ok: true };
}
/**
 * Leave the seat but stay in the room (spectator). Never touches chips. If the member is still
 * in the current hand the seat is kept until that hand ends, so pot and stacks settle normally.
 */
export function standUp(member: SeatMember, inHand: boolean): SeatResult {
  if (member.seat === null) return refuse('SEAT_REQUEST_INVALID', '앉아 있는 자리가 없어요.');
  if (member.standPending) return refuse('SEAT_REQUEST_INVALID', '이번 판이 끝나면 자리에서 일어나요.');
  member.seatHeldUntil = undefined;
  if (inHand) member.standPending = 'voluntary';
  else releaseSeat(member);
  return { ok: true };
}
/** Free the seat. The member stays in the room with the same balance; seatedBefore makes the next request a 'resit'. */
export function releaseSeat(member: SeatMember) {
  if (member.seat !== null) member.seatedBefore = true;
  member.seat = null;
  member.seatHeldUntil = undefined;
  member.standPending = undefined;
}
export function dropMemberRequests(room: SeatRoom, memberId: string) {
  room.seatRequests = room.seatRequests.filter(r => r.playerId !== memberId);
}
export function seatRequestView(room: SeatRoom, r: SeatRequest): SeatRequestView {
  const member = room.players.find(p => p.id === r.playerId);
  return { id: r.id, playerId: r.playerId, nickname: member?.nickname ?? '', seat: r.seat, kind: r.kind, stack: member?.stack ?? r.stack, requestedAt: r.requestedAt };
}

/**
 * Restore seats from a checkpoint. Legacy checkpoints (no seatLayout) seated everyone with an
 * ever-growing counter: map them in the same order onto 0..n-1 and remap the dealer marker.
 * Current checkpoints are validated; out-of-range/duplicate seats become unseated and requests
 * that no longer fit are dropped. Returns the dealer seat to use.
 */
export function restoreSeats(room: SeatRoom, saved: { seatLayout?: number; seatRequests?: unknown }, dealerSeat: number): number {
  if (saved.seatLayout !== SEAT_COUNT) {
    const order = [...room.players].sort((a, b) => Number(a.seat) - Number(b.seat));
    let dealer = -1;
    order.forEach((member, seat) => {
      if (Number(member.seat) <= dealerSeat) dealer = seat;
      member.seat = seat < SEAT_COUNT ? seat : null;
      member.seatedBefore = member.seat !== null;
    });
    room.nextSeat = order.length;
    room.seatRequests = [];
    return dealer;
  }
  const used = new Set<number>();
  for (const member of room.players) {
    const seat = member.seat;
    if (member.standPending !== 'voluntary' && member.standPending !== 'expired') member.standPending = undefined;
    if (!Number.isFinite(member.seatHeldUntil)) member.seatHeldUntil = undefined;
    if (seat === null || !Number.isSafeInteger(seat) || seat < 0 || seat >= SEAT_COUNT || used.has(seat)) { member.seat = null; member.standPending = undefined; member.seatHeldUntil = undefined; continue; }
    used.add(seat);
  }
  const requested = new Set<string>();
  room.seatRequests = [];
  for (const r of Array.isArray(saved.seatRequests) ? saved.seatRequests as Partial<SeatRequest>[] : []) {
    const member = room.players.find(p => p.id === r?.playerId);
    if (!member || member.seat !== null || requested.has(member.id) || typeof r.id !== 'string'
      || !Number.isSafeInteger(r.seat) || r.seat! < 0 || r.seat! >= SEAT_COUNT || used.has(r.seat!)) continue;
    requested.add(member.id); used.add(r.seat!);
    room.seatRequests.push({ id: r.id, playerId: member.id, seat: r.seat!, kind: r.kind === 'resit' ? 'resit' : 'sit',
      stack: Number.isSafeInteger(r.stack) ? r.stack! : member.stack, requestedAt: Number.isFinite(r.requestedAt) ? r.requestedAt! : Date.now() });
  }
  return dealerSeat;
}
