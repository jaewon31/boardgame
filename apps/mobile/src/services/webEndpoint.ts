import { validEndpoint } from './endpoint';

export function webEndpoint(configured: string | undefined, development: boolean, location: { protocol: string; hostname: string } | undefined): string {
  const value = configured?.trim();
  if (value) {
    if (!validEndpoint(value, !development) || (location?.protocol === 'https:' && value.startsWith('ws:'))) return '';
    // Android emulator alias only has meaning inside the emulator. In web dev,
    // use the browser's host, retaining the explicitly configured port/path.
    const url = new URL(value);
    if (development && url.hostname === '10.0.2.2') {
      if (!location || location.protocol !== 'http:') return '';
      url.hostname = location.hostname;
      return url.toString();
    }
    return value;
  }
  // HTTPS development requires an explicit TLS-capable game endpoint.
  if (!development || !location || location.protocol !== 'http:') return '';
  const host = location.hostname.includes(':') && !location.hostname.startsWith('[') ? `[${location.hostname}]` : location.hostname;
  return host ? `ws://${host}:3000/lobby` : '';
}
