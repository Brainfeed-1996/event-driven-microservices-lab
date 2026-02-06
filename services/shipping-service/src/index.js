import pino from 'pino';
import { Kafka } from 'kafkajs';
import { startOtel, shutdownOtel } from './otel.js';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });
const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9092';

await startOtel();

const kafka = new Kafka({ clientId: 'shipping-service', brokers: [kafkaBroker] });
const consumer = kafka.consumer({ groupId: 'shipping-service' });
const producer = kafka.producer();

await producer.connect();
await consumer.connect();
await consumer.subscribe({ topic: 'payments', fromBeginning: true });

log.info({ kafkaBroker }, 'shipping-service started');

await consumer.run({
  eachMessage: async ({ message }) => {
    const raw = message.value?.toString('utf8') || '{}';
    const evt = JSON.parse(raw);

    if (evt.eventType !== 'payment.authorized') {
      log.info({ orderId: evt.orderId, eventType: evt.eventType }, 'ignoring non-authorized payment');
      return;
    }

    const out = {
      eventType: 'shipment.created',
      orderId: evt.orderId,
      createdAt: new Date().toISOString()
    };

    await producer.send({
      topic: 'shipments',
      messages: [{ key: evt.orderId, value: JSON.stringify(out), headers: { 'x-event-type': 'shipment.created' } }]
    });

    log.info({ orderId: evt.orderId }, 'shipment.created emitted');
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
