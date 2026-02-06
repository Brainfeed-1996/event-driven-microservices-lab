# Kafka vs RabbitMQ (notes for this lab)

## Kafka (stream)

- Best when you want **retention**, replay, multiple independent consumer groups
- Ordering is per-partition
- Good for event sourcing / analytics / fan-out

## RabbitMQ (queue)

- Best for **work queues**, routing patterns, RPC-style messaging
- Strong support for DLQs, TTL, dead-lettering, priority, etc.
- Great for task distribution and back-pressure with acknowledgements

## Why both here

Most real systems end up with both patterns:

- Kafka for durable domain events
- RabbitMQ for operational queues / background work
