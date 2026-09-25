import { createAppServer } from './http.ts';
import { attachLobby } from './lobby.ts';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const host = process.env.HOST ?? '0.0.0.0';
const server = createAppServer();
const lobby = attachLobby(server);
server.listen(port, host, () => {
  console.log(`Game server listening on ${host}:${port} (health: /health, WebSocket: /lobby)`);
});
function shutdown() {
  lobby.close();
  server.close();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
