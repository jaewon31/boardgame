import { logRecord } from '@boardgame/shared';
import { FriendStatsStore } from './FriendStatsStore.ts';
import { friendStatsApi } from './friendStatsApi.ts';
import { join,dirname } from 'node:path';
import { existsSync,readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { accountAuthorizer } from './accountSession.ts';
import { createAppServer } from './http.ts';
import { attachLobby } from './lobby.ts';
import { SqliteStateStore } from './stateStore.ts';
import { serverConfig } from './config.ts';

// Local mobile and server use the same public Supabase project configuration.
// Production must supply these values through its environment.
const local=process.env.NODE_ENV==='production'?{}:parseEnv(existsSync(new URL('../../mobile/.env.local',import.meta.url))?readFileSync(new URL('../../mobile/.env.local',import.meta.url),'utf8'):'');
const authUrl=process.env.SUPABASE_URL??local.EXPO_PUBLIC_SUPABASE_URL??'';
const authKey=process.env.SUPABASE_PUBLISHABLE_KEY??local.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY??'';
if(!authUrl||!authKey) throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY before starting the game server');
const config = serverConfig(process.env);
const store = config.statePath ? new SqliteStateStore(config.statePath) : undefined;
let ready = false;
const stats=new FriendStatsStore(process.env.STATS_DB_PATH??join(dirname(config.statePath??'./data/boardgame.sqlite'),'stats.sqlite'));
const authorize=accountAuthorizer(authUrl,authKey);
const server = createAppServer(() => ready,friendStatsApi(stats,authorize,authUrl,authKey,config.trustedProxies));
const lobby = attachLobby(server, { ...config, authorize, recordHand:(id,players)=>stats.record(id,players), store, onFatal: () => setImmediate(() => shutdown(1)) });
server.listen(config.port, config.host, () => {
  ready = true;
  console.log(JSON.stringify(logRecord({event:'server_started', port:config.port, durable:!!store})));
});
server.on('error', () => { console.error(JSON.stringify(logRecord({event:'server_error'}, 'error'))); shutdown(1); });
const metrics = setInterval(() => console.log(JSON.stringify(logRecord({event:'server_stats', ...lobby.stats(), memoryBytes:process.memoryUsage().rss}))),60000);
metrics.unref();
let closing = false;
function shutdown(code = 0) {
  if (closing) { if (code) process.exitCode = code; return; }
  closing = true; ready = false; clearInterval(metrics);
  process.exitCode = code;
  try { lobby.close(); } finally { store?.close(); stats.close(); server.close(); }
  setTimeout(() => process.exit(process.exitCode || 0),10000).unref();
}
process.once('SIGINT', () => shutdown());
process.once('SIGTERM', () => shutdown());
