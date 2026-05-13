# Reliability Runbooks

These runbooks cover the local MVP reliability features: consumer retries,
per-topic DLQs, durable outbox retry, and Prometheus metrics endpoints.

Use the repository [README](../../README.md) for the canonical local startup,
e2e validation, and cleanup workflow. These runbooks assume that local services
are running through the documented Nx targets.

## Metrics Endpoints

The endpoints are served by Nest HTTP apps using `@willsoto/nestjs-prometheus`.

- API Gateway: `GET http://localhost:3000/metrics`
- Portfolio Manager: `GET http://localhost:9101/metrics`
- Execution Engine: `GET http://localhost:9102/metrics`
- External API Facade: `GET http://localhost:9103/metrics`
- Data Ingestion: `GET http://localhost:9104/metrics`

Additional metric families for Iteration 10 services:

- `external_api_facade_active_subscriptions` — gauge of active Binance WebSocket connections
- `external_api_facade_messages_published_total` — counter of `market.raw.data` messages published
- `external_api_facade_reconnects_total` — counter of WebSocket reconnect attempts

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
   Synthetic `trading.signals` publishing is test/operator tooling only; it is
   not an API Gateway or Dashboard product endpoint.
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
- `instrument.registered.dlq`
- `market.raw.data.dlq`

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

## Replay From `instrument.registered.dlq` or `market.raw.data.dlq`

Data Ingestion publishes `DeadLetterEvent` protobuf envelopes to these topics
after bounded retry exhaustion.

1. Inspect the DLQ envelope (integration stack example):

```bash
# instrument.registered failures
docker compose -f infra/docker-compose.test.yml exec -T redpanda \
  rpk topic consume instrument.registered.dlq -o -1 -n 5 \
  -f 'key=%k partition=%p offset=%o headers=%h value_hex=%v{hex}\n'

# market.raw.data failures
docker compose -f infra/docker-compose.test.yml exec -T redpanda \
  rpk topic consume market.raw.data.dlq -o -1 -n 5 \
  -f 'key=%k partition=%p offset=%o headers=%h value_hex=%v{hex}\n'
```

2. Decode `DeadLetterEvent` and inspect `error_message`. Common causes:
   - `instrument.registered.dlq`: External API Facade gRPC unreachable, or
     subscription request rejected (e.g. unknown symbol).
   - `market.raw.data.dlq`: TimescaleDB unavailable, or malformed/truncated
     `MarketDataBar` proto payload.

3. Fix the root cause (restore Facade connectivity, fix DB, or repair the
   source event), then republish `original_value` to `original_topic` using
   `original_key` and `original_headers`.

4. Confirm `data-ingestion` processes the replayed message:

```bash
# Watch data-ingestion logs
npx nx run data-ingestion:serve 2>&1 | grep -E 'inserted|error|dlq'

# Or check TimescaleDB directly (integration stack)
docker compose -f infra/docker-compose.test.yml exec -T timescaledb \
  psql -U timescale -d timescale_db \
  -c "SELECT count(*) FROM market_data_bars WHERE created_at > now() - interval '2 minutes';"
```

## Inspect Stuck Events in TimescaleDB

Use these queries against the TimescaleDB container to diagnose missing bars or
write failures.

**Count recent bars by instrument and interval:**

```sql
SELECT instrument_id, interval, count(*) AS bar_count,
       max(time) AS latest_bar, now() - max(time) AS lag
FROM market_data_bars
GROUP BY instrument_id, interval
ORDER BY lag DESC;
```

A `lag` value significantly larger than the configured kline interval (default
`1m`) means bars are not being written. Check Data Ingestion logs for consumer
errors and verify the `market.raw.data` topic is receiving messages.

**Check for duplicate or missing bars in a time range:**

```sql
-- Gaps: find intervals where consecutive bars are more than 2 × interval apart
SELECT instrument_id, interval, time,
       lead(time) OVER (PARTITION BY instrument_id, interval ORDER BY time) AS next_time,
       lead(time) OVER (PARTITION BY instrument_id, interval ORDER BY time) - time AS gap
FROM market_data_bars
WHERE instrument_id = '<instrument_id>'
  AND interval = '1m'
  AND time > now() - interval '1 hour'
ORDER BY time;
```

**Verify idempotent insert (no duplicate source_event_id):**

```sql
SELECT source_event_id, count(*) AS n
FROM market_data_bars
GROUP BY source_event_id
HAVING count(*) > 1;
```

This should always return zero rows; a non-empty result means the `ON CONFLICT`
clause in `PgMarketDataRepository` is not being triggered as expected.

**Connect to the integration TimescaleDB container:**

```bash
docker compose -f infra/docker-compose.test.yml exec -T timescaledb \
  psql -U timescale -d timescale_db
```

**Connect to the development TimescaleDB container:**

```bash
docker compose -f infra/docker-compose.yml exec -T timescaledb \
  psql -U timescale -d timescale_db
```

## Expected `market.raw.data` Volume and Growth Rate

Each active Binance kline subscription publishes one `market.raw.data` message
per completed candle. At the default `1m` interval:

| Active instruments | Messages / hour | Messages / day |
|--------------------|-----------------|----------------|
| 1                  | 60              | 1 440          |
| 10                 | 600             | 14 400         |
| 50                 | 3 000           | 72 000         |

**TimescaleDB row size estimate:** Each `market_data_bars` row stores 9
`NUMERIC(36,18)` columns plus text fields, approximately 200–350 bytes on disk
before compression. TimescaleDB chunk compression typically achieves 10–20×,
reducing effective storage to ~15–35 bytes/row at rest.

**Anomaly indicators:**

- `market.raw.data` throughput drops to zero while subscriptions show as active
  in Facade metrics (`external_api_facade_active_subscriptions > 0`) →
  WebSocket stream stalled; check `external_api_facade_reconnects_total` and
  Facade logs.
- `market.raw.data.dlq` message count increasing → Data Ingestion cannot write
  to TimescaleDB; check DB connectivity and disk space.
- `lag` in the bar gap query above grows beyond 2–3 intervals → consumer is
  falling behind or has stopped; check Data Ingestion consumer metrics and
  Redpanda consumer group lag:

```bash
docker compose -f infra/docker-compose.yml exec -T redpanda \
  rpk group describe data-ingestion-consumer
```
