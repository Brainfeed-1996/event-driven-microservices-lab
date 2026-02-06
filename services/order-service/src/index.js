import express from 'express';
import pino from 'pino';
import { startOtel, shutdownOtel } from './otel.js';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
app.use(express.json());

await startOtel();

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// NOTE: This service is a placeholder to evolve the lab (e.g., gateway -> order-service -> events).
// For now, the API Gateway publishes order.created directly.

const port = process.env.PORT || 8081;
const server = app.listen(port, () => log.info({ port }, 'order-service listening'));

async function shutdown() {
  log.info('shutting down');
  server.close();
  await shutdownOtel();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
