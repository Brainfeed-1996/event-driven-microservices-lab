import pino from 'pino';
import { Kafka } from 'kafkajs';
import amqp from 'amqplib';
import { startOtel, shutdownOtel } from './otel.js';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });
const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9092';
const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

await startOtel();

const kafka = new Kafka({ clientId: 'shipping-service', brokers: [kafkaBroker] });
const consumer = kafka.consumer({ groupId: 'shipping-service' });
const producer = kafka.producer();

await producer.connect();
await consumer.connect();
await consumer.subscribe({ topic: 'payments', fromBeginning: true });

const rabbitConn = await amqp.connect(rabbitUrl);
const rabbitCh = await rabbitConn.createChannel();
await rabbitCh.assertExchange('domain.events', 'topic', { durable: true });
const q = await rabbitCh.assertQueue('shipping-service', { durable: true });
await rabbitCh.bindQueue(q.queue, 'domain.events', 'payment.authorized');

async function emitShipment(evt) {
  const out = {
    eventType: 'shipment.created',
    orderId: evt.orderId,
    createdAt: new Date().toISOString()
  };

  await producer.send({
    topic: 'shipments',
    messages: [{ key: evt.orderId, value: JSON.stringify(out), headers: { 'x-event-type': 'shipment.created' } }]
  });

  rabbitCh.publish(
    'domain.events',
    'shipment.created',
    Buffer.from(JSON.stringify(out)),
    { contentType: 'application/json', messageId: evt.orderId }
  );

  log.info({ orderId: evt.orderId }, 'shipment.created emitted');
}

log.info({ kafkaBroker, rabbitUrl }, 'shipping-service started');

// Kafka path
await consumer.run({
  eachMessage: async ({ message }) => {
    const raw = message.value?.toString('utf8') || '{}';
    const evt = JSON.parse(raw);

    if (evt.eventType !== 'payment.authorized') {
      return;
    }

    await emitShipment(evt);
  }
});

// RabbitMQ path
rabbitCh.consume(q.queue, async (msg) => {
  if (!msg) return;
  try {
    const evt = JSON.parse(msg.content.toString('utf8'));
    await emitShipment(evt);
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
