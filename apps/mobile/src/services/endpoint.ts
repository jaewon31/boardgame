export function validEndpoint(value: string, production: boolean): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash || url.search || url.pathname !== '/lobby') return false;
    if (!production) return url.protocol === 'ws:' || url.protocol === 'wss:';
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return url.protocol === 'wss:' && !!host && !host.includes(':') && !/^\d+\.\d+\.\d+\.\d+$/.test(host)
      && host !== 'localhost' && !host.endsWith('.localhost')
      && !host.endsWith('.local') && !host.endsWith('.invalid') && !host.endsWith('.example')
      && host !== '::1' && host !== '0.0.0.0' && !/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  } catch { return false; }
}
