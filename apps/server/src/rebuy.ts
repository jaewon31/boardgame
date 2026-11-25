import { randomUUID } from 'node:crypto';
import { MAX_REBUY_CHIPS } from '@boardgame/shared';
import type { ErrorCode, RebuyNotice, RebuyRequestView } from '@boardgame/shared';

/**
 * Rebuy (policy C): a member asks for a number of extra chips, the host approves or rejects.
 *
 * Kept apart from seating (seating.ts never grants chips; this module never moves a seat):
 *  - one pending request per member, decided once (the request is removed before anything else);
 *  - the server alone decides the amount granted and when it is applied;
 *  - a grant for a member who is still in an unfinished hand is held in `pendingRebuy` and added
 *    only once that hand has settled, so pots, side pots and payouts of the running hand never see it.
 */
export const MAX_REBUY = MAX_REBUY_CHIPS;
const MAX_LOG = 50;

export interface RebuyMember {
  id: string;
  nickname: string;
  /** Chip balance. Only applyGrant/applyPendingRebuys in this module add to it. */
  stack: number;
  /** Approved chips waiting for the member's current hand to settle. */
  pendingRebuy?: number;
  /** Last decision on this member's rebuy request (shown only to them). */
  rebuyNotice?: RebuyNotice;
}
export interface RebuyRequest { id: string; playerId: string; amount: number; requestedAt: number }
/** Audit trail of approved grants (server-side; bounded). */
export interface RebuyGrant { requestId: string; playerId: string; amount: number; approvedAt: number; appliedAt?: number }
export interface RebuyRoom {
  hostId: string;
  players: RebuyMember[];
  rebuyRequests: RebuyRequest[];
  rebuyLog: RebuyGrant[];
  /** Recently used request ids (client-supplied or server-made): a resend with a known id does nothing. */
  rebuySeen: string[];
}
const MAX_SEEN = 200;
const remember = (room: RebuyRoom, id: string) => { room.rebuySeen = [id, ...room.rebuySeen.filter(x => x !== id)].slice(0, MAX_SEEN); };
/** Idempotency key: a client UUID (the same format the host uses to decide), otherwise a fresh server id. */
const requestKey = (clientRequestId?: string) => clientRequestId && /^[a-f0-9-]{36}$/.test(clientRequestId) ? clientRequestId : randomUUID();
const overLimit = (amount: number, limit: number) => `1회 최대 ${limit.toLocaleString()}칩까지 요청할 수 있어요.`;
export type RebuyResult = { ok: true } | { ok: false; code: ErrorCode; message: string; changed?: boolean };
const refuse = (code: ErrorCode, message: string, changed = false): RebuyResult => ({ ok: false, code, message, changed });

export const validRebuyAmount = (amount: unknown): amount is number =>
  typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_REBUY;

/** Queue a request for the host. `limit` is the room's per-request maximum (settings.maxRebuy). */
export function requestRebuy(room: RebuyRoom, member: RebuyMember, amount: number, limit: number, now = Date.now(), clientRequestId?: string): RebuyResult {
  if (!validRebuyAmount(amount)) return refuse('REBUY_REQUEST_INVALID', `추가 칩은 1 이상 ${MAX_REBUY.toLocaleString()} 이하의 정수로 입력해 주세요.`);
  const id = requestKey(clientRequestId);
  if (room.rebuySeen.includes(id)) return { ok: true }; // resend of a request already received: nothing more
  if (amount > limit) return refuse('REBUY_REQUEST_INVALID', overLimit(amount, limit));
  if (room.rebuyRequests.some(r => r.playerId === member.id)) return refuse('REBUY_REQUEST_INVALID', '이미 칩 추가 승인을 기다리고 있어요. 요청을 취소한 뒤 다시 보내 주세요.');
  member.rebuyNotice = undefined;
  remember(room, id);
  room.rebuyRequests.push({ id, playerId: member.id, amount, requestedAt: now });
  return { ok: true };
}
/**
 * The host's own rebuy: no approval step, same limit. Granted at once, or held until the host's
 * current hand ends. A resend with the same request id grants nothing more.
 */
export function grantHostRebuy(room: RebuyRoom, host: RebuyMember, amount: number, limit: number, inHand: (member: RebuyMember) => boolean,
  now = Date.now(), clientRequestId?: string): RebuyResult {
  if (room.hostId !== host.id) return refuse('REBUY_REQUEST_INVALID', '방장만 바로 칩을 추가할 수 있어요.');
  if (!validRebuyAmount(amount)) return refuse('REBUY_REQUEST_INVALID', `추가 칩은 1 이상 ${MAX_REBUY.toLocaleString()} 이하의 정수로 입력해 주세요.`);
  const id = requestKey(clientRequestId);
  if (room.rebuySeen.includes(id)) return { ok: true };
  if (amount > limit) return refuse('REBUY_REQUEST_INVALID', overLimit(amount, limit));
  if (host.stack + (host.pendingRebuy ?? 0) + amount > Number.MAX_SAFE_INTEGER) return refuse('REBUY_REQUEST_INVALID', '칩 수량이 너무 커서 추가할 수 없어요.');
  remember(room, id);
  room.rebuyRequests = room.rebuyRequests.filter(r => r.playerId !== host.id); // a queued request from before becoming host is superseded
  const grant: RebuyGrant = { requestId: id, playerId: host.id, amount, approvedAt: now };
  room.rebuyLog = [grant, ...room.rebuyLog].slice(0, MAX_LOG);
  if (inHand(host)) host.pendingRebuy = (host.pendingRebuy ?? 0) + amount;
  else { host.stack += amount; grant.appliedAt = now; }
  host.rebuyNotice = { requestId: id, amount, approved: true, applied: grant.appliedAt !== undefined, at: now };
  return { ok: true };
}
/** After the limit changes: requests above the new limit are dropped and their senders told why. */
export function revalidateRebuys(room: RebuyRoom, limit: number, now = Date.now()) {
  for (const r of room.rebuyRequests.filter(q => q.amount > limit)) {
    const member = room.players.find(p => p.id === r.playerId);
    if (member) member.rebuyNotice = { requestId: r.id, amount: r.amount, approved: false, applied: false, at: now, reason: 'limit', limit };
  }
  room.rebuyRequests = room.rebuyRequests.filter(q => q.amount <= limit);
}
export function cancelRebuyRequest(room: RebuyRoom, member: RebuyMember): RebuyResult {
  const before = room.rebuyRequests.length;
  room.rebuyRequests = room.rebuyRequests.filter(r => r.playerId !== member.id);
  return room.rebuyRequests.length === before ? refuse('REBUY_REQUEST_INVALID', '취소할 칩 추가 요청이 없어요.') : { ok: true };
}
/**
 * Host decision, applied once: the request is removed first, so a repeated approval (double tap,
 * resend after reconnect) finds nothing and grants nothing. `inHand` says whether the requester is
 * still dealt into an unfinished hand; then the grant waits in pendingRebuy.
 */
export function resolveRebuyRequest(room: RebuyRoom, decider: RebuyMember, requestId: string, approve: boolean,
  inHand: (member: RebuyMember) => boolean, now = Date.now(), limit = MAX_REBUY): RebuyResult {
  if (room.hostId !== decider.id) return refuse('REBUY_REQUEST_INVALID', '방장만 칩 추가 요청을 승인하거나 거절할 수 있어요.');
  const request = room.rebuyRequests.find(r => r.id === requestId);
  if (!request) return refuse('REBUY_REQUEST_INVALID', '이미 처리됐거나 취소된 요청이에요.');
  room.rebuyRequests = room.rebuyRequests.filter(r => r !== request);
  const requester = room.players.find(p => p.id === request.playerId);
  if (!requester) return refuse('REBUY_REQUEST_INVALID', '요청한 친구가 방을 나갔어요.', true);
  if (approve && request.amount > limit) {
    requester.rebuyNotice = { requestId: request.id, amount: request.amount, approved: false, applied: false, at: now, reason: 'limit', limit };
    return refuse('REBUY_REQUEST_INVALID', overLimit(request.amount, limit), true);
  }
  if (approve && requester.stack + (requester.pendingRebuy ?? 0) + request.amount > Number.MAX_SAFE_INTEGER) {
    requester.rebuyNotice = { requestId: request.id, amount: request.amount, approved: false, applied: false, at: now };
    return refuse('REBUY_REQUEST_INVALID', '칩 수량이 너무 커서 승인할 수 없어요.', true);
  }
  if (approve) {
    const grant: RebuyGrant = { requestId: request.id, playerId: requester.id, amount: request.amount, approvedAt: now };
    room.rebuyLog = [grant, ...room.rebuyLog].slice(0, MAX_LOG);
    if (inHand(requester)) requester.pendingRebuy = (requester.pendingRebuy ?? 0) + request.amount;
    else { requester.stack += request.amount; grant.appliedAt = now; }
  }
  requester.rebuyNotice = { requestId: request.id, amount: request.amount, approved: approve, applied: approve && !requester.pendingRebuy, at: now };
  return { ok: true };
}
/** Hand boundary: add held grants for members no longer in an unfinished hand. Returns true if any applied. */
export function applyPendingRebuys(room: RebuyRoom, inHand: (member: RebuyMember) => boolean, now = Date.now()): boolean {
  let changed = false;
  for (const member of room.players) {
    if (!member.pendingRebuy || inHand(member)) continue;
    member.stack += member.pendingRebuy;
    member.pendingRebuy = undefined;
    for (const grant of room.rebuyLog) if (grant.playerId === member.id && grant.appliedAt === undefined) grant.appliedAt = now;
    if (member.rebuyNotice?.approved) member.rebuyNotice = { ...member.rebuyNotice, applied: true };
    changed = true;
  }
  return changed;
}
export function dropMemberRebuys(room: RebuyRoom, memberId: string) {
  room.rebuyRequests = room.rebuyRequests.filter(r => r.playerId !== memberId);
}
export function rebuyRequestView(room: RebuyRoom, r: RebuyRequest): RebuyRequestView {
  const member = room.players.find(p => p.id === r.playerId);
  const stack = member?.stack ?? 0, pending = member?.pendingRebuy ?? 0;
  return { id: r.id, playerId: r.playerId, nickname: member?.nickname ?? '', amount: r.amount, stack, pendingChips: pending, expectedStack: stack + pending + r.amount, requestedAt: r.requestedAt };
}
/** Checkpoint validation: drop malformed entries and requests of members that are gone. */
export function restoreRebuys(room: RebuyRoom, saved: { rebuyRequests?: unknown; rebuyLog?: unknown; rebuySeen?: unknown }) {
  room.rebuySeen = (Array.isArray(saved.rebuySeen) ? saved.rebuySeen : []).filter((id): id is string => typeof id === 'string' && id.length <= 64).slice(0, MAX_SEEN);
  const seen = new Set<string>();
  room.rebuyRequests = [];
  for (const r of Array.isArray(saved.rebuyRequests) ? saved.rebuyRequests as Partial<RebuyRequest>[] : []) {
    if (!r || typeof r.id !== 'string' || typeof r.playerId !== 'string' || seen.has(r.playerId) || !validRebuyAmount(r.amount)
      || !room.players.some(p => p.id === r.playerId)) continue;
    seen.add(r.playerId);
    room.rebuyRequests.push({ id: r.id, playerId: r.playerId, amount: r.amount, requestedAt: Number.isFinite(r.requestedAt) ? r.requestedAt! : Date.now() });
    if (!room.rebuySeen.includes(r.id)) room.rebuySeen.push(r.id);
  }
  room.rebuyLog = (Array.isArray(saved.rebuyLog) ? saved.rebuyLog as Partial<RebuyGrant>[] : [])
    .filter(g => g && typeof g.requestId === 'string' && typeof g.playerId === 'string' && validRebuyAmount(g.amount) && Number.isFinite(g.approvedAt))
    .slice(0, MAX_LOG).map(g => ({ requestId: g.requestId!, playerId: g.playerId!, amount: g.amount!, approvedAt: g.approvedAt!, ...(Number.isFinite(g.appliedAt) ? { appliedAt: g.appliedAt } : {}) }));
  for (const g of room.rebuyLog) if (!room.rebuySeen.includes(g.requestId)) room.rebuySeen.push(g.requestId);
  for (const member of room.players) {
    if (member.pendingRebuy !== undefined && (!Number.isSafeInteger(member.pendingRebuy) || member.pendingRebuy <= 0)) member.pendingRebuy = undefined;
  }
}
