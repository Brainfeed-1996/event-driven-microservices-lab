import express from 'express';
import pino from 'pino';
import { Kafka } from 'kafkajs';
import amqp from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import { startOtel, shutdownOtel } from './otel.js';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });

const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9092';
const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

const app = express();
app.use(express.json());

await startOtel();

const kafka = new Kafka({ clientId: 'api-gateway', brokers: [kafkaBroker] });
const producer = kafka.producer();
await producer.connect();

const rabbitConn = await amqp.connect(rabbitUrl);
const rabbitCh = await rabbitConn.createChannel();
await rabbitCh.assertExchange('domain.events', 'topic', { durable: true });

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Creates an order and publishes an event to both Kafka and RabbitMQ so you can compare.
app.post('/orders', async (req, res) => {
  const orderId = uuidv4();
  const payload = {
    eventType: 'order.created',
    orderId,
    amount: req.body?.amount ?? 42,
    currency: req.body?.currency ?? 'EUR',
    createdAt: new Date().toISOString()
  };

  await producer.send({
    topic: 'orders',
    messages: [{ key: orderId, value: JSON.stringify(payload), headers: { 'x-event-type': 'order.created' } }]
  });

  rabbitCh.publish(
    'domain.events',
    'order.created',
    Buffer.from(JSON.stringify(payload)),
    { contentType: 'application/json', messageId: orderId }
  );

  log.info({ orderId }, 'order.created published');
  res.status(201).json({ orderId });
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
