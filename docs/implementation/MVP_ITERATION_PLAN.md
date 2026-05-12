# Trading Bot MVP Roadmap

## Purpose

This document tracks what remains before the trading bot is a usable MVP. It
replaces the original implementation iteration plan now that Iterations 1-8 are
complete.

The backend MVP foundation, Dashboard visibility, and full-system e2e coverage
are already in place. The remaining MVP work should make that foundation
reproducible from a clean checkout and document the operational boundaries for
future contributors.

## Completed Backend Baseline

Iterations 1-8 are treated as complete and should not be repeated as active
roadmap work.

Implemented baseline:

- Contract foundation:
  - shared protobuf contracts in `common`
  - Kafka topic constants, partition key helpers, metadata headers, and event
    versioning conventions
  - explicit local Redpanda topic bootstrap with broker auto-creation disabled
- Registration path:
  - `api-gateway` REST registration endpoint
  - `portfolio-manager` gRPC registration handling
  - durable outbox dispatch for `instrument.registered`
- Risk pipeline:
  - `trading.signals` instrument-stage consumer
  - `trading.signals.portfolio` portfolio-stage repartitioning
  - deterministic approvals/rejections on `trades.approved` and
    `trades.rejected`
  - persisted signal receipts, candidate audit rows, risk decisions, and
    exposure reservations
- Execution simulator:
  - `execution-engine` consumer for `trades.approved`
  - deterministic simulated order, partial fill, and final fill lifecycle
  - execution-owned persistence and outbox dispatch for `orders.placed` and
    `orders.fills`
- Fill reconciliation and portfolio state:
  - `portfolio-manager` consumer for `orders.fills`
  - idempotent order/fill ingestion
  - signed net position accounting, portfolio summary snapshots, and
    `portfolio.updated`
- Read visibility:
  - `portfolio-manager` portfolio read gRPC API
  - `execution-engine` recent execution order gRPC API
  - `api-gateway` REST aggregation endpoint:
    `GET /api/portfolios/:portfolioId?recentOrdersLimit=20`
- Reliability and operability:
  - shared Kafka consumer retry/DLQ wrapper
  - per-topic DLQs for implemented consumers
  - Prometheus metrics endpoints
  - reliability runbooks for replay, stuck outbox inspection, DLQ drain, and
    local failure drills
- Dashboard operations console:
  - Nx React/Vite Dashboard app
  - portfolio list and selected portfolio visibility
  - configured instruments, open positions, recent execution orders, and nested
    fills
  - portfolio-scoped instrument form using
    `POST /api/portfolios/:portfolioId/instrument`
  - loading, empty, validation, and upstream error states
  - no signal injection, strategy editor, trading controls, market charts,
    websocket stream, or auth
- Full-system e2e:
  - dedicated `trading-bot-e2e` Nx/Playwright project
  - isolated e2e Redpanda/Postgres lifecycle through the `infra` Nx project
  - database migration and seed workflow for `portfolio-alpha`
  - startup of `portfolio-manager`, `execution-engine`, `api-gateway`, and
    `dashboard` through Nx targets
  - synthetic `common.Signal` publishing to `trading.signals` from test harness
    code only
  - REST and browser-visible Dashboard assertions, plus duplicate source signal
    and duplicate fill replay checks
- Operational polish and documentation (Iteration 9):
  - `README.md` added as canonical local validation walkthrough covering clean-checkout
    setup, infra start, database migrations, portfolio seeding, service startup, e2e
    validation path, and interactive inspection path
  - env examples normalized for root shared Kafka/retry/gRPC config, `api-gateway`,
    `portfolio-manager`, `execution-engine`, `dashboard`, and integration/e2e stacks
  - MVP limitations clearly documented; runbooks and docs links updated to reference
    implemented plural `/api/portfolios...` paths

Current validation remains:

```bash
npx nx run common:test
npx nx run api-gateway:test
npx nx run portfolio-manager:test
npx nx run execution-engine:test
npx nx run dashboard:test
npx nx run dashboard:typecheck
npx nx run dashboard:build
npx nx run trading-bot-e2e:test
npx nx run trading-bot-e2e:typecheck
npx nx run portfolio-manager:test-integration
npx nx run execution-engine:test-integration
npx nx run trading-bot-e2e:e2e
```

## Remaining MVP Iterations

### Iteration 10: Market Data and Exchange Integration

Goal: implement the External API Facade (NestJS/TypeScript) and the Data
Ingestion service (Rust), connecting Binance market data to the trading
pipeline via Kafka and TimescaleDB.

Detailed implementation plan: `docs/implementation/ITERATION_10_PLAN.md`

Scope:

- External API Facade (NestJS/TypeScript):
  - gRPC API: `StartMarketDataSubscription` and `StopMarketDataSubscription`
  - Binance WebSocket kline stream with testnet/production switch via env
  - Direct Kafka publish to `market.raw.data` (no outbox — streaming workload)
  - Prometheus metrics endpoint
- Data Ingestion service (Rust):
  - Consumes `instrument.registered` → starts Binance kline subscription via Facade
  - Consumes `market.raw.data` → writes OHLCV bars to TimescaleDB
  - gRPC API: `GetMarketDataBars` for historical queries
  - Startup re-subscription from portfolio-manager gRPC `ListInstruments`
  - DLQ publishing for both consumers
  - sqlx offline cache committed; integration tests require live TimescaleDB
- Proto contracts: `proto/events/market.proto`, `proto/services/external_api_facade.proto`,
  `proto/services/data_ingestion.proto`
- API Gateway: `GET /api/market-data/bars` proxy to Data Ingestion
- New Kafka topics: `instrument.registered.dlq`, `market.raw.data.dlq`
- Infra: add both services to `docker-compose.yml`
- NX Rust integration: `Cargo.toml` workspace at repo root; NX targets for
  build, test, lint, fmt, audit

Known limitations for this iteration:

- Binance API keys not required (kline streams are public); keys are optional
  and documented for future order placement only.
- No Feature Engineering or Prediction Engine (next roadmap items).
- No real order placement (execution engine simulator remains in place).
- No WebSocket/live dashboard market data stream.

Acceptance criteria:

- `instrument.registered` event triggers a Binance kline subscription via Facade.
- Kline events flow from Binance → Facade → `market.raw.data` → Data Ingestion → TimescaleDB.
- `GET /api/market-data/bars` returns stored bars via API Gateway.
- All Rust targets pass: `nx run data-ingestion:lint`, `nx run data-ingestion:test`,
  `nx run data-ingestion:fmt`.
- All TypeScript targets pass: `nx run external-api-facade:test`,
  `nx run external-api-facade:typecheck`.

## Post-MVP Roadmap

These items are intentionally grouped by capability rather than sprint-sized
iterations.

### Prediction and Feature Pipeline

- Feature Engineering service consuming raw market data.
- Indicator publishing on `features.indicators`.
- Real Prediction Engine producing `trading.signals`.
- Signal cache and read API for dashboard signal visibility.
- Model registry and training pipeline once prediction logic needs lifecycle
  management.

### Strategy and Risk Configuration

- Strategy/risk configuration APIs in API Gateway and Portfolio Manager.
- Dashboard strategy editor.
- Start/stop trading controls.
- Expanded risk rules beyond the current deterministic MVP checks.
- Audit views for risk decisions, rejected trades, and configuration changes.

### Execution Maturity

- Consume `orders.placed` in Portfolio Manager for richer lifecycle state.
- Delayed placed-only, partially filled, cancelled, and rejected order states.
- Paper execution adapter.
- Real exchange order adapter behind explicit safety controls.
- Order amendment and cancellation workflows.

### Dashboard Expansion

- Real-time portfolio updates.
- Market charts and indicator overlays.
- Signal monitor and recommendation history.
- Trade history and decision audit screens.
- Operator views for outbox backlog, DLQs, and metrics.

### Platform Operations

- Schema registry.
- Grafana dashboards backed by Prometheus metrics.
- Dedicated replay and DLQ repair tooling.
- Deployment manifests and environment-specific configuration.
- Authentication, authorization, secrets management, and production security
  posture.

### Future e2e tests candidates:

- `instrument-registration.spec.ts`: drive the dashboard/API Gateway instrument
  registration flow, assert the selected portfolio reflects the registered
  instrument, and keep Kafka assertions behind existing read APIs or test
  harness utilities.
- `risk-rejection.spec.ts`: publish a signal that breaches portfolio risk
  limits, assert no execution order, fill, or position mutation is created, and
  verify the browser-visible portfolio state remains unchanged.
- `sell-reconciliation.spec.ts`: seed or create an existing long position,
  publish a SELL signal, and assert quantity, exposure, recent order, fills, and
  dashboard state all decrease consistently.
- `portfolio-read-navigation.spec.ts`: keep a lightweight browser/API smoke for
  portfolio list, select, refresh, loading, and upstream error states without
  publishing Kafka events.
- `service-restart-idempotency.spec.ts`: after the reconciliation flow is
  stable, restart one consumer service through Nx-owned targets, replay a
  relevant event, and assert the read model does not duplicate mutations.

## Roadmap Working Rules

1. Keep the remaining MVP focused on proving the implemented backend path.
2. Prefer existing API Gateway product endpoints for UI work.
3. Keep synthetic signal publishing inside e2e/manual test tooling until a real
   Prediction Engine exists.
4. Continue using shared proto contracts, topic constants, and key helpers.
5. Every new event-producing feature must preserve deterministic keys,
   idempotency identity, and documented replay behavior.
6. Use `nx` targets for tests, builds, linting, typechecks, and e2e validation.
