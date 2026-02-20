# Trading Bot MVP Iteration Plan

## Purpose

This plan breaks MVP delivery into small, testable iterations. Each iteration is designed to produce a demo-able outcome, reduce uncertainty, and keep strict ordering and reconciliation guarantees aligned with the architecture.

## Current Baseline

- Existing apps: `api-gateway`, `portfolio-manager`
- Existing shared library: `common` (proto + shared utilities)
- Existing infra: Redpanda/Kafka + Postgres + Timescale via `infra/docker-compose.yml`
- Existing implemented flow: REST (`api-gateway`) -> gRPC (`portfolio-manager`) -> DB write + outbox dispatch to Kafka

## Working Rules For All Iterations

1. Keep each PR bounded to one vertical slice and one acceptance test path.
2. Prefer compatibility changes first (additive proto/schema changes, no breaking renames until consumers are ready).
3. Always ship tests with each iteration:
   - Unit tests for business logic.
   - Integration tests for service boundaries.
   - Replay/idempotency tests for event consumers.
4. Use constants and generated contracts, no hardcoded topic names or payload shapes in application code.
5. Every event must include deterministic keys and idempotency identity.

## Definition of Done (Applies Per Iteration)

- Features implemented for that iteration scope.
- `nx` tests pass for affected projects.
- Updated docs in `docs/architecture/ARCHITECTURE.md` and this file when behavior changes.
- Manual smoke test steps are documented and reproducible.

---

## Iteration 1: Stabilize Foundation

### Goal

Normalize event contracts and topic/key usage so downstream iterations can build safely.

### Scope

- In scope:
  - Central Kafka topic and partition-key constants.
  - Event envelope standard (metadata + payload).
  - Instrument registration event aligned with architecture topic names.
  - Local bootstrap scripts/checklist for topics.
- Out of scope:
  - Signal consumers.
  - Execution/fill flows.

### Detailed Tasks

1. Shared constants and conventions in `common`
   - Add topic constants (for example: `instrument.registered`, `trading.signals`, `trading.signals.portfolio`, `trades.approved`, `trades.rejected`, `orders.placed`, `orders.fills`, `portfolio.updated`).
   - Add key builder helpers:
     - `instrumentKey(exchange, instrumentId)`
     - `portfolioKey(portfolioId)`
     - `riskKey(portfolioId, instrumentId)`
2. Event envelope contract
   - Add an envelope type/contract with:
     - `eventId`
     - `eventType`
     - `schemaVersion`
     - `occurredAt`
     - `producer`
     - `key`
     - `payload`
   - Decide one transport strategy and apply consistently:
     - protobuf envelope in value, or
     - headers + protobuf payload in value.
3. Registration event alignment
   - Replace current registration event topic usage with architecture-aligned topic.
   - Ensure partition key is deterministic and documented.
4. Topic bootstrap support
   - Add infra helper script to create required topics and partition counts in local Redpanda.
   - Add one smoke script to produce/consume a sample registration event.
5. Docs and developer workflow
   - Add setup section with expected env vars and local run order.
   - Add brief "event contract versioning rules" subsection.

### Suggested File Touchpoints

- `libs/common/src/lib/...` (new kafka constants and key helpers)
- `libs/common/src/proto/...` (if envelope is modeled in proto)
- `apps/portfolio-manager/src/portfolio/portfolio.service.ts` (topic/key/event structure)
- `apps/portfolio-manager/src/event-dispatcher/event-dispatcher.service.ts` (header/envelope handling if needed)
- `infra/...` (topic bootstrap helper + docs)

### Acceptance Criteria

- Registering an instrument emits exactly one event on the correct topic with correct key.
- Topic names and keys are consumed from shared constants only.
- Smoke script demonstrates successful produce/consume in local environment.

### Validation Commands

```bash
npx nx run portfolio-manager:test
npx nx run api-gateway:test
npx nx run-many -t test -p common,portfolio-manager,api-gateway
```

---

## Iteration 2: Risk Pipeline (Instrument -> Portfolio Ordered)

### Goal

Implement strict two-stage risk evaluation with clear ordering boundaries.

### Scope

- In scope:
  - Consume `trading.signals` keyed by `instrument_key`.
  - Run instrument-level checks.
  - Repartition to `trading.signals.portfolio` keyed by `portfolio_key`.
  - Run portfolio-level checks.
  - Publish `trades.approved` or `trades.rejected`.
- Out of scope:
  - Real execution.
  - Portfolio read APIs.

### Detailed Tasks

1. Signal contracts
   - Define protobuf/event payloads for:
     - incoming signals
     - risk decision outcomes
   - Include idempotency fields and causal references (`sourceEventId`).
2. Portfolio manager Kafka consumers/producers
   - Add consumer group for instrument-stage processing.
   - Add publisher for portfolio-stage repartition topic.
   - Add consumer group for portfolio-stage processing.
3. Risk engine first version
   - Implement minimal deterministic rules:
     - instrument enabled/disabled
     - per-instrument max position/trade size
     - per-portfolio exposure cap
   - Keep rules config local/static first, externalize later.
4. Persistence and audit
   - Persist risk decisions to Postgres for traceability.
   - Persist idempotency keys to avoid duplicate outcomes on replays.
5. Ordering and replay tests
   - Add tests for:
     - out-of-order input batches
     - duplicate events
     - same instrument across multiple portfolios

### Suggested File Touchpoints

- `apps/portfolio-manager/src/...` (new risk consumer/producer modules and service logic)
- `apps/portfolio-manager/prisma/schema.prisma` + migration (risk decisions/idempotency)
- `libs/common/src/proto/...` (signal/risk events)

### Acceptance Criteria

- A signal always yields exactly one decision (`approved` or `rejected`) per idempotency key.
- Instrument and portfolio ordering behavior is deterministic and test-covered.
- Replaying the same signal does not create extra approved trades.

### Validation Commands

```bash
npx nx run portfolio-manager:test
npx nx run-many -t test -p common,portfolio-manager
```

---

## Iteration 3: Execution Simulator Service

### Goal

Introduce a minimal execution engine that simulates order placement and fills.

### Scope

- In scope:
  - New `execution-engine` service.
  - Consume `trades.approved`.
  - Emit `orders.placed`.
  - Emit `orders.fills` (simulated partial/full fill paths).
- Out of scope:
  - Real exchange APIs.
  - Complex order types.

### Detailed Tasks

1. Scaffold service
   - Create new Nest app with Nx.
   - Add env validation and Kafka client setup.
2. Execution contracts
   - Define protobuf/event payloads for:
     - order placed
     - order update/fill
   - Ensure payloads include deterministic order IDs and references to approvals.
3. Simulator core logic
   - For each approved trade:
     - emit placed event
     - emit one or more fill events after deterministic delay/logic
   - Add idempotency guard so same approved event does not create multiple order streams.
4. Tests
   - Unit tests for simulator logic.
   - Integration tests for consume -> emit chain.
5. Local demo flow
   - Script or documented steps to inject approved trade and observe placed/fills.

### Suggested File Touchpoints

- `apps/execution-engine/...` (new app)
- `libs/common/src/proto/...` (execution events)
- `docs/architecture/ARCHITECTURE.md` (if event payload semantics are clarified)

### Acceptance Criteria

- Each approved trade produces deterministic simulated order lifecycle events.
- Duplicate approved trade messages do not create duplicate orders.
- Event keys match documented partition-key strategy.

### Validation Commands

```bash
npx nx run execution-engine:test
npx nx run-many -t test -p common,execution-engine
```

---

## Iteration 4: Fills Reconciliation and Portfolio State

### Goal

Make Risk & Portfolio Manager the true source of truth by reconciling fills into portfolio state.

### Scope

- In scope:
  - Consume `orders.fills`.
  - Persist orders/fills/positions.
  - Update aggregate portfolio exposure.
  - Emit `portfolio.updated`.
- Out of scope:
  - Advanced accounting/tax lots.
  - Performance analytics.

### Detailed Tasks

1. Data model expansion
   - Add Prisma models for order, fill, position, and portfolio summary snapshots.
   - Add unique constraints for idempotent fill ingestion.
2. Reconciliation workflow
   - Build consumer in portfolio-manager for `orders.fills`.
   - Upsert order/fill state idempotently.
   - Recalculate positions and portfolio exposure.
3. Publish read-model change events
   - Emit `portfolio.updated` with enough context for API consumers.
4. Replay correctness tests
   - Verify repeated/reordered fill events converge to same final state.
5. Operational recovery
   - Add replay/backfill command for a bounded window (optional command target).

### Suggested File Touchpoints

- `apps/portfolio-manager/prisma/schema.prisma` + migration
- `apps/portfolio-manager/src/...` reconciliation consumer/service
- `libs/common/src/proto/...` for fill and portfolio update events

### Acceptance Criteria

- Portfolio state is derived from persisted fills and is reproducible.
- Duplicate fill events are absorbed without state corruption.
- `portfolio.updated` is emitted on material state change.

### Validation Commands

```bash
npx nx run portfolio-manager:test
npx nx run-many -t test -p common,portfolio-manager
```

---

## Iteration 5: Read APIs and Minimal User Visibility

### Goal

Expose portfolio and recent execution state via gRPC and REST so the MVP is observable to users.

### Scope

- In scope:
  - Implement portfolio read query in portfolio-manager.
  - Expose REST endpoint in api-gateway.
  - Basic response DTOs and mapping.
- Out of scope:
  - Full dashboard frontend.
  - Real-time websocket streaming.

### Detailed Tasks

1. Contracts and service methods
   - Finalize/implement `GetPortfolio` request/response behavior.
   - Define pagination/limits for recent trades/fills.
2. Portfolio manager query path
   - Add gRPC handler with query + mapping from DB models.
   - Include summary, open positions, and recent fills/trades.
3. API gateway REST path
   - Add controller endpoint and mapping from gRPC to HTTP DTO.
   - Keep consistent error mapping strategy.
4. Tests and docs
   - Controller/service tests in both apps.
   - Swagger/OpenAPI updates and sample responses.

### Suggested File Touchpoints

- `apps/portfolio-manager/src/portfolio/...`
- `apps/api-gateway/src/portfolio/...`
- `libs/common/src/proto/services/portfolio_manager.ts` (generated from proto changes)

### Acceptance Criteria

- After a simulated trade lifecycle, one API call returns updated portfolio state.
- Error behavior and timeouts are mapped predictably in API gateway.
- Query paths are test-covered.

### Validation Commands

```bash
npx nx run portfolio-manager:test
npx nx run api-gateway:test
npx nx run-many -t test -p common,portfolio-manager,api-gateway
```

---

## Iteration 6: Hardening, Reliability, and Operability

### Goal

Ensure the MVP survives partial failures and is operable by one engineer.

### Scope

- In scope:
  - Retry and DLQ policy.
  - Metrics and structured observability.
  - Correlation IDs and tracing context through events.
  - Runbooks and failure drills.
- Out of scope:
  - Multi-region HA.
  - Enterprise security/compliance features.

### Detailed Tasks

1. Retry and DLQ design
   - Define max retry attempts and backoff policy per consumer.
   - Define dead-letter topics and payload shape.
2. Observability
   - Add counters and timers for:
     - consume rate
     - decision latency
     - reconciliation failures
     - outbox backlog
   - Standardize log fields:
     - `eventId`, `correlationId`, `topic`, `key`, `service`
3. Failure scenario tests
   - Broker unavailable during emit.
   - Consumer crash/restart while in-flight.
   - DB transient failure during reconciliation.
4. Runbooks
   - "How to replay from topic X for window Y"
   - "How to inspect stuck outbox events"
   - "How to drain DLQ safely"

### Suggested File Touchpoints

- `apps/portfolio-manager/src/event-dispatcher/...`
- `apps/portfolio-manager/src/...` consumer modules
- `apps/execution-engine/src/...`
- `docs/` runbook docs

### Acceptance Criteria

- System recovers from temporary broker or DB failure without losing committed business events.
- DLQ path is verified in test or controlled local drill.
- Operational docs are sufficient to execute replay/recovery.

### Validation Commands

```bash
npx nx run-many -t test -p common,portfolio-manager,api-gateway,execution-engine
```

---

## Iteration Workflow Template (Use Per Sprint)

1. Plan
   - Confirm exact scope and acceptance criteria from this file.
2. Implement
   - Keep code changes scoped to one iteration goals.
3. Verify
   - Run `nx` tests for affected projects.
   - Run local smoke flow.
4. Document
   - Update architecture and this plan if behavior changed.
5. Demo
   - Show one end-to-end scenario and known limitations.

## Suggested Cadence

- 1 iteration = 1 week (or 4-5 focused sessions)
- Ship small and frequently:
  - Day 1: contracts + scaffolding
  - Days 2-3: core logic
  - Day 4: tests + smoke
  - Day 5: docs + polish
