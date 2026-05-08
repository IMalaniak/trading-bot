# Reliability Runbooks

These runbooks cover the local MVP reliability features: consumer retries,
per-topic DLQs, durable outbox retry, and Prometheus metrics endpoints.

## Metrics Endpoints

- API Gateway: `GET http://localhost:3000/metrics`
- Portfolio Manager: `GET http://localhost:9101/metrics`
- Execution Engine: `GET http://localhost:9102/metrics`

Useful metric families:

- `trading_bot_kafka_consumer_messages_total`
- `trading_bot_kafka_consumer_retries_total`
- `trading_bot_kafka_consumer_dlq_messages_total`
- `trading_bot_kafka_consumer_processing_seconds`
- `trading_bot_outbox_dispatch_total`
- `trading_bot_outbox_backlog`
- `trading_bot_outbox_oldest_pending_age_seconds`

## Replay From A Topic Window

1. Identify the topic, partition, and offset window to replay.
2. Stop the affected consumer service to avoid concurrent processing.
3. Inspect records with `rpk`:

```bash
docker compose -f infra/docker-compose.yml exec -T redpanda \
  rpk topic consume orders.fills -p 0 -o 120 -n 25 \
  -f 'key=%k partition=%p offset=%o headers=%h value_hex=%v{hex}\n'
```

4. Republish only the records that should be replayed, preserving the original
   key and headers when the replay should keep the same idempotency identity.
5. Restart the consumer and watch:

```bash
curl -s http://localhost:9101/metrics | rg 'kafka_consumer|outbox'
```

## Inspect Stuck Outbox Events

Portfolio Manager:

```sql
SELECT topic, status, COUNT(*) AS count, MIN("createdAt") AS oldest
FROM "OutboxEvent"
WHERE status IN ('PENDING', 'IN_FLIGHT', 'FAILED')
GROUP BY topic, status
ORDER BY oldest;

SELECT id, topic, key, status, attempts, "nextAttemptAt", "lastError"
FROM "OutboxEvent"
WHERE status IN ('PENDING', 'IN_FLIGHT', 'FAILED')
ORDER BY "createdAt"
LIMIT 20;
```

Execution Engine:

```sql
SELECT topic, status, COUNT(*) AS count, MIN("createdAt") AS oldest
FROM "execution_engine"."OutboxEvent"
WHERE status IN ('PENDING', 'IN_FLIGHT', 'FAILED')
GROUP BY topic, status
ORDER BY oldest;

SELECT id, topic, key, "lifecycleSequence", status, attempts, "nextAttemptAt", "lastError"
FROM "execution_engine"."OutboxEvent"
WHERE status IN ('PENDING', 'IN_FLIGHT', 'FAILED')
ORDER BY "createdAt", "lifecycleSequence"
LIMIT 20;
```

Outbox rows are not moved to DLQ. They retry until Kafka accepts the committed
business event. Fix broker connectivity or malformed publisher config, then let
the dispatcher retry.

## Drain A DLQ Safely

DLQ topics:

- `trading.signals.dlq`
- `trading.signals.portfolio.dlq`
- `trades.approved.dlq`
- `orders.fills.dlq`

1. Pause or stop the source consumer.
2. Inspect the DLQ envelope:

```bash
docker compose -f infra/docker-compose.yml exec -T redpanda \
  rpk topic consume orders.fills.dlq -o -1 -n 1 \
  -f 'key=%k partition=%p offset=%o headers=%h value_hex=%v{hex}\n'
```

3. Decode `DeadLetterEvent` with the generated common proto types or a small
   local script. Verify `original_topic`, `original_key`, `original_headers`,
   `error_message`, `correlation_id`, and `causation_id`.
4. Fix the root cause. Examples: apply a missing migration, repair invalid test
   data, or deploy a decoder/handler fix.
5. Republish `original_value` to `original_topic` using `original_key` and
   `original_headers`.
6. Restart the source consumer and confirm no new DLQ messages appear.

Do not bulk-drain DLQs before confirming that replaying the first message is
idempotent and succeeds.

## Local Failure Drills

- Broker unavailable during emit:
  1. Stop Redpanda after a business row and outbox row are committed.
  2. Confirm `trading_bot_outbox_backlog` increases and outbox rows remain retryable.
  3. Restart Redpanda and confirm outbox rows dispatch.
- Poison consumer message:
  1. Publish malformed protobuf bytes to `trades.approved`.
  2. Confirm a `DeadLetterEvent` appears on `trades.approved.dlq`.
  3. Confirm the original offset is committed only after DLQ publish.
- Transient DB failure:
  1. Temporarily make the target database unavailable.
  2. Restore it before consumer retry attempts are exhausted.
  3. Confirm no DLQ message is written and the consumer success counter increments.
