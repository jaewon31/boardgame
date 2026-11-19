import { createServer } from 'node:http';
import type { IncomingMessage,ServerResponse } from 'node:http';
import type { HealthResponse } from '@boardgame/shared';
import { allowedOrigin } from './origins.ts';

export function createAppServer(ready: () => boolean = () => true, extra?: (request:IncomingMessage,response:ServerResponse)=>Promise<boolean>, origins: readonly string[] = []) {
  return createServer(async(request, response) => {
    // Authenticated API responses and failures must not enter browser/CDN caches.
    response.setHeader('Cache-Control','no-store');
    const origin=request.headers.origin;
    response.setHeader('Vary','Origin');
    if(!allowedOrigin(origin,origins)) {response.writeHead(403);response.end('Origin not allowed');return;}
    if(origin) response.setHeader('Access-Control-Allow-Origin',origin);
    if(request.method==='OPTIONS') {
      const headers=String(request.headers['access-control-request-headers']??'').toLowerCase().split(',').map(v=>v.trim()).filter(Boolean);
      const path=/^\/friends\/[0-9a-f-]{36}(?:\/[0-9a-f-]{36})?\/stats$/i.test(request.url??'') || request.url==='/health';
      if(!origin || !path || request.headers['access-control-request-method']!=='GET' || headers.some(h=>h!=='authorization'&&h!=='content-type')) {response.writeHead(403);response.end();return;}
      response.setHeader('Access-Control-Allow-Methods','GET');
      response.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
      response.setHeader('Vary','Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      response.writeHead(204);response.end();return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      if (!ready()) { response.writeHead(503); response.end('unavailable'); return; }
      const body: HealthResponse = { status: 'ok', service: 'boardgame-server' };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
      return;
    }
    if(extra){if(!ready()){response.writeHead(503);response.end('unavailable');return;}try{if(await extra(request,response))return;}catch{response.writeHead(503);response.end('unavailable');return;}}
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
  });
}
