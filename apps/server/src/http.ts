import { createServer } from 'node:http';
import type { HealthResponse } from '@boardgame/shared';

export function createAppServer(ready: () => boolean = () => true) {
  return createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      if (!ready()) { response.writeHead(503); response.end('unavailable'); return; }
      const body: HealthResponse = { status: 'ok', service: 'boardgame-server' };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
      return;
    }
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
  });
}
