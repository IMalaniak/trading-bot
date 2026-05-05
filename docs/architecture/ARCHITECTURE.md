# Trading Bot Platform Architecture

## Table of Contents

- [Trading Bot Platform Architecture](#trading-bot-platform-architecture)
  - [Table of Contents](#table-of-contents)
  - [Architecture Summary](#architecture-summary)
  - [Current Implementation Status](#current-implementation-status)
  - [Target Architecture](#target-architecture)
  - [Eventing, Ordering, and Consistency](#eventing-ordering-and-consistency)
    - [Current event transport contract](#current-event-transport-contract)
    - [Ordering and idempotency rules](#ordering-and-idempotency-rules)
    - [Versioning rules](#versioning-rules)
    - [Outbox pattern](#outbox-pattern)
  - [Kafka Topics and Partition Keys](#kafka-topics-and-partition-keys)
  - [Local Development Workflow](#local-development-workflow)
  - [C4 Model Diagrams](#c4-model-diagrams)
  - [Workflows](#workflows)
    - [Current: Instrument Registration](#current-instrument-registration)
    - [Current: Risk Pipeline](#current-risk-pipeline)
    - [Current: Execution Simulator](#current-execution-simulator)
    - [Current: Fill Reconciliation](#current-fill-reconciliation)
    - [Planned: End-to-End Trading Flow](#planned-end-to-end-trading-flow)

## Architecture Summary

The platform is an event-driven trading system built around small services, explicit Kafka topic contracts, and service-owned datastores.

Two principles are already active in the current codebase and should remain stable as the MVP grows:

- Business state changes are committed to Postgres before being published to Kafka.
- Kafka topics, keys, and event metadata are treated as explicit contracts, not ad-hoc strings.

The current implementation is still intentionally narrow:

- `api-gateway` exposes the registration REST path.
- `portfolio-manager` stores instruments, runs the current two-stage risk pipeline, writes outbox records, and dispatches Kafka events.
- `execution-engine` consumes approved trades, persists deterministic simulated order lifecycles, writes outbox records, and dispatches order events.
- `common` owns shared proto contracts and Kafka contract helpers.
- Local infra provides Redpanda, Postgres, and TimescaleDB.

Everything else in this document should be read as either:

- implemented now, or
- planned target state, explicitly marked below.

## Current Implementation Status

| Area                             | Status               | Notes                                                                                                  |
| -------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| API Gateway                      | Implemented          | REST entrypoint forwards registration to `portfolio-manager` over gRPC.                                |
| Risk & Portfolio Manager         | Implemented          | Instrument registration, the two-stage risk pipeline, and fill reconciliation are implemented in `portfolio-manager`. |
| Outbox Dispatcher                | Implemented          | Kafka publish happens from the outbox, not inline with the DB write; shared dispatch mechanics live in `common`. |
| Shared Contracts (`common`)      | Implemented          | Proto types, topic constants, key builders, Kafka header helpers, and reusable outbox dispatch ports live here. |
| Message Bus (Redpanda/Kafka API) | Implemented          | Local development uses Redpanda.                                                                       |
| Portfolio DB (Postgres)          | Implemented          | Source of truth for instruments, outbox rows, portfolios, risk decisions, exposure reservations, reconciled orders/fills, positions, and portfolio summary snapshots. |
| Market Data Store (TimescaleDB)  | Implemented in infra | Provisioned locally, but not yet exercised by application code in this repo.                           |
| Data Ingestion Service           | Planned              | Not implemented in this repo yet.                                                                      |
| Feature Engineering Service      | Planned              | Not implemented in this repo yet.                                                                      |
| Prediction Engine                | Planned              | Not implemented in this repo yet.                                                                      |
| Execution Engine                 | Implemented          | Event-only simulator consumes approved trades and emits deterministic placed/fill lifecycle events.    |
| Execution DB (Postgres schema)   | Implemented          | Source of truth for simulated orders, fills, and execution outbox rows.                                |
| External API Facade              | Planned              | Not implemented in this repo yet.                                                                      |
| Dashboard                        | Planned              | Not implemented in this repo yet.                                                                      |
| Schema Registry                  | Planned              | Documented as a future capability; not provisioned in local infra.                                     |

## Target Architecture

The intended MVP direction remains:

- `instrument.registered` starts per-instrument downstream activity.
- `trading.signals` is consumed in instrument order.
- `trading.signals.portfolio` is the repartitioned portfolio-order stage.
- `trades.approved` and `trades.rejected` are the risk decision outputs.
- `orders.placed` and `orders.fills` come from the execution engine.
- `portfolio.updated` is emitted by the risk and portfolio manager after reconciliation.

That target architecture is still valid. Today the repo implements registration,
the current two-stage risk pipeline, a durable execution simulator, and fill
reconciliation. Prediction and real exchange execution remain planned.

## Eventing, Ordering, and Consistency

### Current event transport contract

Kafka messages use:

- Kafka record key as the authoritative partition key
- protobuf domain payload in the message value
- metadata in Kafka headers

Standard headers:

- `event-id`
- `event-type`
- `schema-version`
- `occurred-at`
- `producer`
- `content-type`

Current payload boundaries:

- `instrument.registered` uses `InstrumentRegistered`.
- `trading.signals` reuses `common.Signal` from the prediction domain.
- `trading.signals.portfolio` uses `PortfolioSignalCandidate`.
- `trades.approved` and `trades.rejected` both use `TradeDecision`.
- `orders.placed` uses `OrderPlaced`.
- `orders.fills` uses `OrderFill`.
- `portfolio.updated` uses `PortfolioUpdated`.

The risk pipeline intentionally does not reuse `common.Signal` for downstream portfolio-scoped or decision-scoped topics. Those topics carry lifecycle-specific fields such as `source_event_id`, `portfolio_id`, decision kind, and reason codes.

For Iteration 1 through Iteration 3:

- `event-type` is the topic name
- `schema-version` starts at `"1"` per topic
- `event-id` is generated before the outbox row is written; for events published by `portfolio-manager`, that same value is stored as the outbox row ID and stays stable across retries
- execution simulator event IDs are deterministic: `<order_id>:placed`, `<order_id>:fill:1`, and `<order_id>:fill:2`
- `content-type` is `application/x-protobuf`

Risk pipeline payload notes:

- `Signal.id` is the business signal identity from the prediction domain.
- Kafka header `event-id` is the transport event identity and the source deduplication key for `trading.signals`.
- `PortfolioSignalCandidate.candidate_idempotency_key = <source_event_id>:<portfolio_id>`.
- `TradeDecision` is published to either `trades.approved` or `trades.rejected`; the topic name and embedded `decision` enum must agree.
- Risk limits, prices, notionals, and quantities are stored in Postgres `NUMERIC` columns and compared with Prisma `Decimal` values; binary floating-point is not used for approval decisions.

Execution simulator payload notes:

- `OrderPlaced.order_id = ord_<sha256(candidate_idempotency_key)[0..32]>`.
- `OrderPlaced.approval_event_id` is the inbound `trades.approved` Kafka header `event-id`.
- `OrderFill.fill_id` is the same value as its Kafka `event-id`.
- The default simulator emits one partial fill and one final fill. The first fill is 50% of the requested quantity/notional; the final fill is the exact remainder.
- Execution timestamps are logical offsets from `TradeDecision.decided_at`: placed at +1s, partial fill at +2s, final fill at +3s.
- Execution quantities, notionals, and prices are stored and transported as decimal strings.

Fill reconciliation payload notes:

- `portfolio-manager` consumes `orders.fills`; it does not consume `orders.placed` in the current implementation.
- `PortfolioUpdated` is emitted once for every accepted unique fill and carries a changed snapshot: portfolio ID, source fill ID, order ID, instrument ID, aggregate exposure notional, open position count, changed position quantity, changed position average entry price, changed position exposure notional, and update timestamp.
- Reconciled position quantities, average prices, exposures, fill quantities, and fill notionals are stored as Postgres `NUMERIC` values and transported as decimal strings.
- Signed net accounting is used: BUY fills increase quantity and SELL fills decrease quantity. Short positions are allowed in the MVP.

### Ordering and idempotency rules

- `instrument_key = <VENUE>:<instrument_id>`
- `portfolio_key = <portfolio_id>`
- `risk_key = <portfolio_id>:<instrument_id>`
- `instrumentKey()` normalizes `venue` to uppercase before joining the key.
- `trading.signals` is processed in Kafka partition order by `instrument_key`; payload timestamps are informational and do not reorder processing.
- `trading.signals.portfolio`, `trades.approved`, and `trades.rejected` are processed in Kafka partition order by `portfolio_key`.
- Source-signal deduplication is keyed by the inbound Kafka header `event-id`, persisted as `SignalReceipt.sourceEventId`.
- `SignalReceipt.sourceEventId` is unique; a replayed source event is treated as already processed and emits no new candidates.
- `PortfolioSignalCandidate.candidate_idempotency_key = <source_event_id>:<portfolio_id>`; exactly one candidate audit row can exist for a given source event and portfolio.
- `RiskDecision.candidateIdempotencyKey` is unique; exactly one final decision can exist for a given candidate and at most one reservation can be attached to it.
- For events emitted by `portfolio-manager`, the Kafka header `event-id` and the outbox row `id` are the same stable identity.
- `execution-engine` consumes `trades.approved` in portfolio order using the `portfolio_key`.
- `ExecutionOrder.approvalEventId` and `ExecutionOrder.candidateIdempotencyKey` are unique, so replaying the same approved trade does not create another order stream.
- `orders.placed` and `orders.fills` use `portfolio_key` and are enqueued with lifecycle sequence `1`, `2`, `3` so placed is dispatched before fills for a given simulated order.
- `portfolio-manager` consumes `orders.fills` in portfolio order using `portfolio_key`.
- `PortfolioFill.id` and `(orderId, sequence)` are unique, so replaying the same fill does not mutate portfolio state or emit another `portfolio.updated`.
- Position state is reproducible from persisted fills ordered by `filledAt`, fill sequence, and fill ID.
- Risk cap checks use filled position exposure plus active exposure reservations.
- A matching exposure reservation is released only after the order has a final fill and all fill sequences from `1..finalSequence` are present.

### Versioning rules

- Additive protobuf field additions are allowed on the same topic.
- Breaking semantic changes require a new documented event type or topic and a new schema version.
- Schema registry is still planned, so version discipline is currently enforced by shared contracts, tests, and documentation.

### Outbox pattern

`portfolio-manager` does not publish Kafka events directly from the write path. It:

1. writes the business record,
2. writes an outbox row in the same transaction,
3. dispatches the outbox row to Kafka asynchronously.

This is the main currently implemented reliability mechanism and remains true for:

- `instrument.registered`
- `trading.signals.portfolio`
- `trades.approved`
- `trades.rejected`
- `portfolio.updated`

`execution-engine` uses the same reliability shape for:

- `orders.placed`
- `orders.fills`

The reusable dispatcher core lives in `common` as a repository/emitter driven
Kafka outbox dispatcher. Service apps keep their own outbox repositories because
each service owns its Prisma client, database schema, enqueue shape, and any
service-specific ordering column such as execution lifecycle sequence.

## Kafka Topics and Partition Keys

Local development bootstraps all documented topics explicitly and disables broker auto-creation so topic-name mistakes fail fast.

| Topic                       | Status                | Producer                                                 | Main consumers                                          | Partition key    | Ordering guarantee |
| --------------------------- | --------------------- | -------------------------------------------------------- | ------------------------------------------------------- | ---------------- | ------------------ |
| `instrument.registered`     | Implemented           | Risk & Portfolio Manager                                 | Planned Data Ingestion                                  | `instrument_key` | Per instrument     |
| `market.raw.data`           | Planned               | Planned External API Facade                              | Planned Data Ingestion, Feature Engineering             | `instrument_key` | Per instrument     |
| `features.indicators`       | Planned               | Planned Feature Engineering                              | Planned Prediction Engine, Data Ingestion               | `instrument_key` | Per instrument     |
| `trading.signals`           | Partially implemented | Planned Prediction Engine                                | Implemented Risk & Portfolio Manager (instrument stage) | `instrument_key` | Per instrument     |
| `trading.signals.portfolio` | Implemented           | Implemented Risk & Portfolio Manager (repartition stage) | Implemented Risk & Portfolio Manager (portfolio stage)  | `portfolio_key`  | Per portfolio      |
| `trades.approved`           | Implemented           | Implemented Risk & Portfolio Manager                     | Implemented Execution Engine                            | `portfolio_key`  | Per portfolio      |
| `trades.rejected`           | Implemented           | Implemented Risk & Portfolio Manager                     | Planned downstream adapters                             | `portfolio_key`  | Per portfolio      |
| `orders.placed`             | Implemented           | Implemented Execution Engine simulator                   | Planned Risk & Portfolio Manager                        | `portfolio_key`  | Per portfolio      |
| `orders.fills`              | Implemented           | Implemented Execution Engine simulator                   | Implemented Risk & Portfolio Manager                    | `portfolio_key`  | Per portfolio      |
| `portfolio.updated`         | Implemented           | Implemented Risk & Portfolio Manager                     | Planned downstream adapters and analytics               | `portfolio_key`  | Per portfolio      |

Local bootstrap defaults:

- partitions: `3`
- replication factor: `1`
- cleanup policy: `delete`

No compacted topics are configured at this stage.

## Local Development Workflow

Expected env files:

- root `.env`
  - `PORTFOLIO_MANAGER_GRPC_URL`
  - `KAFKA_BROKERS`
  - optional `PORT` for `api-gateway`
- `apps/portfolio-manager/.env`
  - `DATABASE_URL`
- `apps/portfolio-manager/.env.test-integration`
  - isolated integration-test `DATABASE_URL`
  - isolated integration-test `KAFKA_BROKERS`
- `apps/execution-engine/.env`
  - `EXECUTION_ENGINE_DATABASE_URL`
- `apps/execution-engine/.env.test-integration`
  - isolated integration-test `EXECUTION_ENGINE_DATABASE_URL`
  - isolated integration-test `KAFKA_BROKERS`
- `infra/.env`
  - Postgres and Timescale credentials for Docker Compose

Suggested local run order:

```bash
docker compose -f infra/docker-compose.yml up -d
npx nx run portfolio-manager:migrate
npx nx run execution-engine:migrate
npx nx run portfolio-manager:seed
npx nx serve portfolio-manager
npx nx serve execution-engine
npx nx serve api-gateway
```

If local Kafka topics need to be re-created after startup, rerun:

```bash
docker compose -f infra/docker-compose.yml run --rm redpanda-init
```

Useful validation commands:

```bash
npx nx run portfolio-manager:test-integration
npx nx run execution-engine:test-integration
```

`portfolio-manager:test-integration` and `execution-engine:test-integration` use the isolated
`infra/docker-compose.test.yml` stack, bootstraps topics via `redpanda-init`,
runs the owning service's `migrate:test-integration` target, and then executes
the integration Jest suite. They do not require the shared local development
stack to be running first.

Manual registration smoke:

1. Start infra and both apps.
2. Call `POST /portfolio/register-instrument` on `api-gateway`.
3. Consume from `instrument.registered`.
4. Verify key, headers, and decoded `InstrumentRegistered` payload.

Manual risk-pipeline smoke:

1. Start infra and `portfolio-manager`.
2. Insert at least one portfolio, one instrument, and one `PortfolioInstrumentConfig` row in Postgres or seed portfolios and sample configs with `npx nx run portfolio-manager:seed`.
3. Publish a `common.Signal` to `trading.signals` with Kafka header `event-id`.
4. Consume from `trading.signals.portfolio`, `trades.approved`, and `trades.rejected`.
5. Verify `SignalReceipt`, `PortfolioSignalCandidateRecord`, `RiskDecision`, and `ExposureReservation` rows in Postgres.

Manual execution-simulator smoke:

1. Start infra and `execution-engine`.
2. Publish an approved `TradeDecision` protobuf message to `trades.approved` with Kafka header `event-id`.
3. Consume from `orders.placed` and `orders.fills`.
4. Verify the Kafka key is `<portfolio_id>`, the placed event appears before fill events, and event IDs follow `<order_id>:placed`, `<order_id>:fill:1`, `<order_id>:fill:2`.
5. Verify `ExecutionOrder`, `ExecutionFill`, and execution `OutboxEvent` rows in the `execution_engine` Postgres schema.

Manual fill-reconciliation smoke:

1. Start infra and `portfolio-manager`.
2. Publish an `OrderFill` protobuf message to `orders.fills` with Kafka header `event-id` equal to the fill ID and key `<portfolio_id>`.
3. Consume from `portfolio.updated`.
4. Verify `PortfolioOrder`, `PortfolioFill`, `PortfolioPosition`, and `PortfolioSummarySnapshot` rows in the portfolio Postgres database.
5. Replay the same fill and verify no additional snapshot or `portfolio.updated` event is created.

## C4 Model Diagrams

The C4 model diagrams live in `docs/architecture/c4`.

To view them interactively:

```bash
./scripts/structurizr-lite.sh
```

## Workflows

### Current: Instrument Registration

This is the implemented flow today.

```mermaid
sequenceDiagram
    participant Client
    participant APIGateway as API Gateway
    participant PortfolioManager as Risk & Portfolio Manager
    participant DB as Portfolio DB
    participant Outbox as Outbox Dispatcher
    participant Kafka as Message Bus

    Client->>APIGateway: POST /portfolio/register-instrument
    APIGateway->>PortfolioManager: gRPC RegisterInstrument()
    PortfolioManager->>DB: Insert instrument + outbox row (same transaction)
    DB-->>PortfolioManager: Commit successful
    PortfolioManager-->>APIGateway: Registration response
    Outbox->>DB: Claim pending outbox row
    Outbox->>Kafka: Publish InstrumentRegistered
    Note right of Kafka: Topic: instrument.registered\nKey: <VENUE>:<instrument_id>
```

### Current: Risk Pipeline

This is implemented in `portfolio-manager` today. The upstream `Prediction Engine`
producer is still planned, so integration tests publish `trading.signals`
directly.

```mermaid
sequenceDiagram
    participant PredictionEngine as Prediction Engine
    participant Kafka as Message Bus
    participant InstrumentStage as Instrument Stage Consumer
    participant PortfolioStage as Portfolio Stage Consumer
    participant DB as Portfolio DB
    participant Outbox as Outbox Dispatcher

    PredictionEngine->>Kafka: Publish common.Signal to trading.signals\nHeaders include event-id
    Kafka-->>InstrumentStage: Consume trading.signals in instrument order
    InstrumentStage->>DB: Insert SignalReceipt
    alt Unknown instrument or no subscribed active portfolios
        InstrumentStage->>DB: Persist audit-only receipt
    else Portfolio configs found
        InstrumentStage->>DB: Insert candidate rows (with target-notional snapshot) + outbox rows
        Outbox->>Kafka: Publish PortfolioSignalCandidate to trading.signals.portfolio
        Kafka-->>PortfolioStage: Consume trading.signals.portfolio in portfolio order
        PortfolioStage->>DB: Insert RiskDecision
        alt Approved
            PortfolioStage->>DB: Insert ExposureReservation + outbox row
            Outbox->>Kafka: Publish TradeDecision to trades.approved
        else Rejected
            PortfolioStage->>DB: Insert outbox row only
            Outbox->>Kafka: Publish TradeDecision to trades.rejected
        end
    end
```

Current rule evaluation order in the portfolio stage:

1. subscription enabled
2. per-trade cap
3. per-instrument reserved exposure cap
4. per-portfolio reserved exposure cap

Current reservation semantics:

- Approved decisions create sticky exposure reservations.
- Reservations plus filled position exposure are the source of truth for cap checks.
- Reservations are released after a matching order reaches complete contiguous fill state.
- No global rejection event is emitted when no eligible portfolios exist; that case is audit-only.
- Instrument stage fans out all active portfolio-instrument configs, including disabled ones, so portfolio stage can emit explicit `SUBSCRIPTION_DISABLED` rejections.
- If a config is deleted or the portfolio becomes inactive after fan-out, portfolio stage rejects the candidate deterministically as `SUBSCRIPTION_DISABLED` using the snapshotted target notional.

### Current: Execution Simulator

This is implemented in `execution-engine` today. It is a deterministic simulator,
not a real exchange adapter.

```mermaid
sequenceDiagram
    participant RiskManager as Risk & Portfolio Manager
    participant Kafka as Message Bus
    participant ExecutionConsumer as Approved Trades Consumer
    participant Simulator as Execution Simulator
    participant DB as Execution DB
    participant Outbox as Outbox Dispatcher

    RiskManager->>Kafka: Publish TradeDecision to trades.approved\nHeaders include event-id
    Kafka-->>ExecutionConsumer: Consume trades.approved in portfolio order
    ExecutionConsumer->>Simulator: Build deterministic order lifecycle
    Simulator->>DB: Insert ExecutionOrder, two ExecutionFill rows, and three outbox rows
    Outbox->>DB: Claim outbox rows in lifecycle order
    Outbox->>Kafka: Publish OrderPlaced to orders.placed
    Outbox->>Kafka: Publish partial OrderFill to orders.fills
    Outbox->>Kafka: Publish final OrderFill to orders.fills
```

Current simulator semantics:

- Only `TradeDecisionKind.APPROVED` is accepted.
- Duplicate `approval_event_id` or `candidate_idempotency_key` messages are absorbed without creating another order lifecycle.
- The simulator persists the final order status as `FILLED` because both fills are generated in the same deterministic lifecycle.
- Real exchange placement, timers, cancellations, and order amendments are planned future work.

### Current: Fill Reconciliation

This is implemented in `portfolio-manager` today. The service consumes fills only;
`orders.placed` remains a planned input.

```mermaid
sequenceDiagram
    participant ExecutionEngine as Execution Engine
    participant Kafka as Message Bus
    participant FillConsumer as Order Fills Consumer
    participant Reconciler as Fill Reconciliation Service
    participant DB as Portfolio DB
    participant Outbox as Outbox Dispatcher

    ExecutionEngine->>Kafka: Publish OrderFill to orders.fills\nHeaders include event-id
    Kafka-->>FillConsumer: Consume orders.fills in portfolio order
    FillConsumer->>Reconciler: Decode fill and metadata
    Reconciler->>DB: Upsert order, insert unique fill, recalculate position
    Reconciler->>DB: Update aggregate exposure snapshot
    alt Complete final fill sequence exists
        Reconciler->>DB: Release matching exposure reservation
    end
    Reconciler->>DB: Insert outbox row for portfolio.updated
    Outbox->>Kafka: Publish PortfolioUpdated
```

Current reconciliation semantics:

- Duplicate identical fills are absorbed without writing another snapshot or event.
- Divergent duplicates fail instead of overwriting portfolio state.
- Position quantities are signed net quantities; average entry price follows weighted average for same-direction fills, stays unchanged when reducing, uses the crossing fill price when reversing, and resets to zero when flat.
- `portfolio.updated` carries only the changed snapshot for the triggering fill, not the full portfolio.
- Bounded replay/backfill is documented as an operator workflow for a later iteration; there is no dedicated replay command yet.

### Planned: End-to-End Trading Flow

The flow below is the intended target architecture, not the current repo state.

```mermaid
sequenceDiagram
    participant Trader

    box System
    participant Dashboard
    participant APIGateway as API Gateway
    participant RiskManager as Risk & Portfolio Manager
    participant DB as Portfolio DB
    participant Kafka as Message Bus
    participant DataIngestion as Data Ingestion
    participant TimescaleDB as Market Data Store
    participant FeatureEng as Feature Engineering
    participant PredictionEngine as Prediction Engine
    participant ExecutionEngine as Execution Engine
    participant ExternalAPI as External API Facade
    end

    box External Systems
    participant Binance as Binance API
    end

    Trader->>Dashboard: Register new instrument
    Dashboard->>APIGateway: POST /portfolio/register-instrument
    APIGateway->>RiskManager: gRPC RegisterInstrument()
    RiskManager->>DB: Store instrument config + outbox row
    Kafka-->>DataIngestion: Consume instrument.registered

    DataIngestion->>ExternalAPI: Start market data stream
    ExternalAPI->>Binance: Subscribe to market data
    ExternalAPI->>Kafka: Publish market.raw.data

    Kafka-->>FeatureEng: Consume market.raw.data
    FeatureEng->>Kafka: Publish features.indicators

    Kafka-->>PredictionEngine: Consume features.indicators
    PredictionEngine->>Kafka: Publish trading.signals

    Kafka-->>RiskManager: Consume trading.signals
    RiskManager->>Kafka: Publish trading.signals.portfolio
    Kafka-->>RiskManager: Consume trading.signals.portfolio

    alt Signal approved
        RiskManager->>Kafka: Publish trades.approved
        Kafka-->>ExecutionEngine: Consume trades.approved
        ExecutionEngine->>ExternalAPI: Place order (planned real execution)
        ExternalAPI->>Binance: Submit exchange order
        ExecutionEngine->>Kafka: Publish orders.placed
        ExecutionEngine->>Kafka: Publish orders.fills
        Kafka-->>RiskManager: Consume orders.fills
        RiskManager->>DB: Reconcile orders, fills, positions
        RiskManager->>Kafka: Publish portfolio.updated
    else Signal rejected
        RiskManager->>Kafka: Publish trades.rejected
    end
```
