import { createGameServer } from './app.js';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error('PORT must be an integer between 0 and 65535.');
}
const gameServer = createGameServer({
  corsOrigins: process.env.FRONTEND_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean),
});
await gameServer.listen(port);
console.log(`성채 평원 서버: http://localhost:${port}`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await gameServer.close();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
