# event-driven-microservices-lab

**Event-driven microservices playground** with **Kafka + RabbitMQ**, end-to-end **distributed tracing** (OpenTelemetry) and repeatable local environments.

> Author: Olivier Robert

## What this is

This repository is a lab-style reference project to:

- compare **Kafka** vs **RabbitMQ** patterns in the same domain
- practice **event choreography** and **sagas** (happy path + failure modes)
- observe **propagated trace context** across HTTP + async messages
- run everything locally with **Docker Compose**

## Architecture (high level)

- **API Gateway** (HTTP)
- **order-service** → publishes `order.created`
- **payment-service** → consumes `order.created`, emits `payment.authorized|payment.failed`
- **shipping-service** → consumes `payment.authorized`, emits `shipment.created`
- **Kafka** broker (local) for high-throughput event streams
- **RabbitMQ** for work queues / RPC-style flows
- **OpenTelemetry Collector** → **Jaeger UI** for traces

### Trace propagation

The lab demonstrates two propagation paths:

1. **HTTP** (W3C `traceparent`) between gateway ↔ services
2. **Async messaging** where trace context is carried in message headers (Kafka headers / AMQP headers)

## Quick start

### Prerequisites

- Docker Desktop
- Node.js 20+ (only needed if you want to run services outside containers)

### Run the full stack

```bash
docker compose up --build
```

Then open:

- Jaeger UI: http://localhost:16686
- RabbitMQ UI: http://localhost:15672 (guest/guest)

## Repository layout

```text
.
├─ docker-compose.yml
├─ infra/
│  └─ otel-collector.yaml
├─ services/
│  ├─ api-gateway/
│  ├─ order-service/
│  ├─ payment-service/
│  └─ shipping-service/
└─ docs/
   ├─ scenarios.md
   ├─ tracing.md
   └─ kafka-vs-rabbitmq.md
```

## Scenarios to try

- **Normal purchase flow**: order → payment authorized → shipment created
- **Payment failure**: emits `payment.failed` and triggers a compensating action
- **Duplicate delivery**: simulate consumer restarts, validate idempotency keys
- **Out-of-order events**: observe how your services behave when event ordering is not guaranteed

See: [`docs/scenarios.md`](docs/scenarios.md)

## Observability

- Traces via OpenTelemetry SDKs in each service
- Central collection via OTEL Collector
- Visualization via Jaeger

See: [`docs/tracing.md`](docs/tracing.md)

## Safety / scope

This is a development lab for learning and experimentation. It is **not** production-hardened.

## License

MIT — see [`LICENSE`](LICENSE).
