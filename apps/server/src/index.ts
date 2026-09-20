import { createAppServer } from './http.ts';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const host = process.env.HOST ?? '127.0.0.1';
const server = createAppServer();
server.listen(port, host, () => console.log('Game server: http://' + host + ':' + port));
