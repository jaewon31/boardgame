// Close reasons are peer-controlled. Never log arbitrary reason/error/message text.
const reasons = new Set([
  'Server busy', 'Too many connections', 'Join timeout', 'Too many pending requests',
  'Request failed', 'Rate limit', 'Authentication unavailable', 'Account session expired',
  'Left room', 'Account replaced', 'Session replaced',
]);
export function safeCloseReason(reason: string): string {
  return reason === '' ? 'empty' : reasons.has(reason) ? reason : 'redacted';
}
