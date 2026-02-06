# Tracing

## Goal

See a single distributed trace span across:

- HTTP request handling
- Kafka production/consumption
- RabbitMQ production/consumption

## Approach

- Each service boots an OpenTelemetry Node SDK.
- The SDK uses auto-instrumentations for HTTP.
- For async messaging, trace context is injected/extracted from message headers.

## Where to look

- Jaeger UI: http://localhost:16686
- Filter by service: `api-gateway`, `order-service`, `payment-service`, `shipping-service`

## Notes

This repo favors clarity over completeness. If you need production-grade telemetry:

- add metrics/logs
- add baggage
- define semantic conventions for message attributes
