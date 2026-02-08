import pino from 'pino';
import { Kafka } from 'kafkajs';
import amqp from 'amqplib';
import { startOtel, shutdownOtel } from './otel.js';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });
const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9092';
const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const failRate = Number(process.env.PAYMENT_FAIL_RATE || 0);

await startOtel();

const kafka = new Kafka({ clientId: 'payment-service', brokers: [kafkaBroker] });
const consumer = kafka.consumer({ groupId: 'payment-service' });
const producer = kafka.producer();

await producer.connect();
await consumer.connect();
await consumer.subscribe({ topic: 'orders', fromBeginning: true });

const rabbitConn = await amqp.connect(rabbitUrl);
const rabbitCh = await rabbitConn.createChannel();
await rabbitCh.assertExchange('domain.events', 'topic', { durable: true });
const q = await rabbitCh.assertQueue('payment-service', { durable: true });
await rabbitCh.bindQueue(q.queue, 'domain.events', 'order.created');

function shouldFail(orderId) {
  if (!failRate) return false;
  const sum = [...orderId].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (sum % 100) < failRate;
}

async function emitPayment(evt) {
  const orderId = evt.orderId;
  const ok = orderId ? !shouldFail(orderId) : true;
  const eventType = ok ? 'payment.authorized' : 'payment.failed';

  const out = {
    eventType,
    orderId,
    amount: evt.amount,
    currency: evt.currency,
    reason: ok ? undefined : 'simulated-decline',
    createdAt: new Date().toISOString()
  };

  // Kafka
  await producer.send({
    topic: 'payments',
    messages: [{ key: orderId, value: JSON.stringify(out), headers: { 'x-event-type': eventType } }]
  });

  // RabbitMQ
  rabbitCh.publish(
    'domain.events',
    eventType,
    Buffer.from(JSON.stringify(out)),
    { contentType: 'application/json', messageId: orderId }
  );

  log.info({ orderId, eventType }, 'emitted payment event');
}

log.info({ kafkaBroker, rabbitUrl, failRate }, 'payment-service started');

// Kafka path
await consumer.run({
  eachMessage: async ({ message }) => {
    const raw = message.value?.toString('utf8') || '{}';
    const evt = JSON.parse(raw);
    if (evt.eventType !== 'order.created') return;
    await emitPayment(evt);
  }
});

// RabbitMQ path
rabbitCh.consume(q.queue, async (msg) => {
  if (!msg) return;
  try {
    const evt = JSON.parse(msg.content.toString('utf8'));
    await emitPayment(evt);
    rabbitCh.ack(msg);
  } catch (e) {
    log.warn({ err: String(e) }, 'failed to process rabbit message');
    rabbitCh.nack(msg, false, false);
  }
});

async function shutdown() {
  log.info('shutting down');
  await consumer.disconnect();
  await producer.disconnect();
  await rabbitCh.close();
  await rabbitConn.close();
  await shutdownOtel();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
