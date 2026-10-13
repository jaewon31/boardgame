import { createAppServer } from './http.ts';
import { attachLobby } from './lobby.ts';
import { SqliteStateStore } from './stateStore.ts';
import { serverConfig } from './config.ts';

const config = serverConfig(process.env);
const store = config.statePath ? new SqliteStateStore(config.statePath) : undefined;
let ready = false;
const server = createAppServer(() => ready);
const lobby = attachLobby(server, { ...config, store, onFatal: () => setImmediate(() => shutdown(1)) });
server.listen(config.port, config.host, () => {
  ready = true;
  console.log(JSON.stringify({event:'server_started', port:config.port, durable:!!store}));
});
server.on('error', () => { console.error(JSON.stringify({event:'server_error'})); shutdown(1); });
const metrics = setInterval(() => console.log(JSON.stringify({event:'server_stats', ...lobby.stats(), memoryBytes:process.memoryUsage().rss})),60000);
metrics.unref();
let closing = false;
function shutdown(code = 0) {
  if (closing) { if (code) process.exitCode = code; return; }
  closing = true; ready = false; clearInterval(metrics);
  process.exitCode = code;
  try { lobby.close(); } finally { store?.close(); server.close(); }
  setTimeout(() => process.exit(process.exitCode || 0),10000).unref();
}
process.once('SIGINT', () => shutdown());
process.once('SIGTERM', () => shutdown());
