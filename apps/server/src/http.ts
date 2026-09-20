import { createServer } from 'node:http';
import type { HealthResponse } from '@boardgame/shared';

export function createAppServer() {
  return createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      const body: HealthResponse = { status: 'ok', service: 'boardgame-server' };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
      return;
    }
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
  });
}
