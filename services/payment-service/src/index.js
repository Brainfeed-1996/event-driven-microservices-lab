import pino from 'pino';
import { Kafka } from 'kafkajs';
import { startOtel, shutdownOtel } from './otel.js';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });
const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9092';
const failRate = Number(process.env.PAYMENT_FAIL_RATE || 0);

await startOtel();

const kafka = new Kafka({ clientId: 'payment-service', brokers: [kafkaBroker] });
const consumer = kafka.consumer({ groupId: 'payment-service' });
const producer = kafka.producer();

await producer.connect();
await consumer.connect();
await consumer.subscribe({ topic: 'orders', fromBeginning: true });

function shouldFail(orderId) {
  if (!failRate) return false;
  // deterministic-ish failure: orderId hash via char codes
  const sum = [...orderId].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (sum % 100) < failRate;
}

log.info({ kafkaBroker, failRate }, 'payment-service started');

await consumer.run({
  eachMessage: async ({ message }) => {
    const raw = message.value?.toString('utf8') || '{}';
    const evt = JSON.parse(raw);
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

    await producer.send({
      topic: 'payments',
      messages: [{ key: orderId, value: JSON.stringify(out), headers: { 'x-event-type': eventType } }]
    });

    log.info({ orderId, eventType }, 'emitted payment event');
  }
});

async function shutdown() {
  log.info('shutting down');
  await consumer.disconnect();
  await producer.disconnect();
  await shutdownOtel();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
