import express from 'express';
import pino from 'pino';
import { Kafka } from 'kafkajs';
import amqp from 'amqplib';
import { startOtel, shutdownOtel } from './otel.js';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });

const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9092';
const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

const app = express();
app.use(express.json());

await startOtel();

// Kept for parity with the lab: gateway still connects to brokers (health, smoke, future use).
const kafka = new Kafka({ clientId: 'api-gateway', brokers: [kafkaBroker] });
const producer = kafka.producer();
await producer.connect();

const rabbitConn = await amqp.connect(rabbitUrl);
const rabbitCh = await rabbitConn.createChannel();
await rabbitCh.assertExchange('domain.events', 'topic', { durable: true });

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Creates an order via order-service (which publishes to Kafka + RabbitMQ).
// This makes the lab more realistic: the gateway delegates domain operations.
const orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://order-service:8081';

app.post('/orders', async (req, res) => {
  // propagate trace context (if any)
  const traceparent = req.header('traceparent');

  const r = await fetch(`${orderServiceUrl}/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(traceparent ? { traceparent } : {})
    },
    body: JSON.stringify({
      amount: req.body?.amount ?? 42,
      currency: req.body?.currency ?? 'EUR'
    })
  });

  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    log.warn({ status: r.status, body }, 'order-service error');
    return res.status(502).json({ ok: false, upstreamStatus: r.status, body });
  }

  return res.status(201).json(body);
});

const port = process.env.PORT || 8080;
const server = app.listen(port, () => log.info({ port }, 'api-gateway listening'));

async function shutdown() {
  log.info('shutting down');
  server.close();
  await producer.disconnect();
  await rabbitCh.close();
  await rabbitConn.close();
  await shutdownOtel();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
