import { isIP } from 'node:net';
export function serverConfig(env: NodeJS.ProcessEnv) {
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = env[key] === undefined ? fallback : Number(env[key]);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
    return value;
  };
  const production = env.NODE_ENV === 'production';
  if (production && !env.STATE_DB_PATH) throw new Error('Production requires STATE_DB_PATH on a persistent volume');
  const trustedProxies = (env.TRUSTED_PROXY_IPS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (trustedProxies.some(ip => !isIP(ip))) throw new Error('TRUSTED_PROXY_IPS must contain exact IP addresses');
  return {
    port:integer('PORT',3000,1,65535), host:env.HOST ?? '0.0.0.0', statePath:env.STATE_DB_PATH,
    trustedProxies, reconnectMs:integer('RECONNECT_MS',300000,30000,1800000),
    maxRooms:integer('MAX_ROOMS',100,1,1000), maxConnections:integer('MAX_CONNECTIONS',240,2,6000),
    maxConnectionsPerIp:integer('MAX_CONNECTIONS_PER_IP',24,2,6000),
  };
}
