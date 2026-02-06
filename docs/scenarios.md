# Scenarios

This lab is intentionally built to let you *break things* in a controlled way.

## 1) Happy path

1. Create an order (via API gateway)
2. Observe `order.created` → `payment.authorized` → `shipment.created`
3. Confirm the **same trace** is visible end-to-end in Jaeger

## 2) Payment failure

- Simulate a payment decline (toggle env `PAYMENT_FAIL_RATE`)
- Ensure a `payment.failed` event is emitted
- Ensure downstream services do not create shipments

## 3) Duplicates / idempotency

- Restart consumers while producing events
- Validate de-duplication using an **idempotency key** (orderId)

## 4) Poison messages

- Produce malformed payloads
- Ensure DLQ / parking-lot handling works (RabbitMQ) and is observable
