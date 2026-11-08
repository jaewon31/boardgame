// Railway extracts the display body from message, not from event.
export function logRecord<T extends {event: string}>(entry: T, level: 'info' | 'error' = 'info') {
  return {...entry, message: entry.event, level, timestamp: new Date().toISOString()};
}
export function validConnectionId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
// Close reasons are peer-controlled. Never log arbitrary reason/error/message text.
const reasons = new Set([
  'Server busy', 'Too many connections', 'Join timeout', 'Too many pending requests',
  'Request failed', 'Rate limit', 'Authentication unavailable', 'Account session expired',
  'Left room', 'Account replaced', 'Session replaced',
]);
export function safeCloseReason(reason: string): string {
  return reason === '' ? 'empty' : reasons.has(reason) ? reason : 'redacted';
}
// Native failures may embed URLs/IPs. Emit only a fixed category, never the text.
export function transportFailure(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  if (/timed? ?out|timeout/i.test(value)) return 'timeout';
  if (/unknownhost|resolve host|name resolution|getaddrinfo/i.test(value)) return 'dns';
  if (/ssl|tls|certificate|handshake/i.test(value)) return 'tls';
  if (/refused|econnrefused/i.test(value)) return 'refused';
  if (/reset|econnreset|connection abort/i.test(value)) return 'reset';
  if (/eof|end of stream|socket closed/i.test(value)) return 'closed';
  return 'unknown';
}
