import { isIP } from 'node:net';

const normalize = (ip: string) => ip.startsWith('::ffff:') ? ip.slice(7) : ip;
// Trust only exact configured proxy addresses, never arbitrary client headers.
export function clientIp(remote: string | undefined, forwarded: string | string[] | undefined, trusted: string[]): string {
  const peer = normalize(remote ?? 'unknown');
  const proxies = new Set(trusted.map(normalize));
  if (!proxies.has(peer) || typeof forwarded !== 'string' || forwarded.length > 1024) return peer;
  const hops = forwarded.split(',').map(s => normalize(s.trim()));
  if (!hops.length || hops.some(ip => !isIP(ip))) return peer;
  for (let i = hops.length - 1; i >= 0; i--) if (!proxies.has(hops[i])) return hops[i];
  return peer;
}
