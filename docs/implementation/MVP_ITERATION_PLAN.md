# Trading Bot MVP Roadmap

## Purpose

This document tracks what remains before the trading bot is a usable MVP. It
replaces the original implementation iteration plan now that Iterations 1-8 are
complete.

The backend MVP foundation, market data ingestion, Dashboard visibility, and
full-system e2e coverage are already in place. The remaining work in this
document tracks post-MVP capability expansion.

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
  - startup of `portfolio-manager`, `execution-engine`, `external-api-facade`,
    `data-ingestion`, `api-gateway`, and `dashboard` through Nx targets
  - synthetic `common.Signal` publishing to `trading.signals` from test harness
    code only
  - REST and browser-visible Dashboard assertions, market-data read assertions,
    plus duplicate source signal, duplicate fill replay, and duplicate market
    data replay checks
- Operational polish and documentation (Iteration 9):
  - `README.md` added as canonical local validation walkthrough covering clean-checkout
    setup, infra start, database migrations, portfolio seeding, service startup, e2e
    validation path, and interactive inspection path
  - env examples normalized for root shared Kafka/retry/gRPC config, `api-gateway`,
    `portfolio-manager`, `execution-engine`, `dashboard`, and integration/e2e stacks
  - MVP limitations clearly documented; runbooks and docs links updated to reference
    implemented plural `/api/portfolios...` paths
- Market data and exchange integration (Iteration 10):
  - `external-api-facade` NestJS service manages Binance kline WebSocket
    subscriptions through `StartMarketDataSubscription` and
    `StopMarketDataSubscription`
  - raw market data is published directly to `market.raw.data` as protobuf
    `MarketDataBar` messages
  - `data-ingestion` Rust service consumes `instrument.registered` to start
    subscriptions, consumes `market.raw.data` to persist final OHLCV bars to
    TimescaleDB, and exposes `GetMarketDataBars` over gRPC
  - API Gateway exposes `GET /api/market-data/bars` through the Data Ingestion
    gRPC API
  - local infra bootstraps `instrument.registered.dlq` and
    `market.raw.data.dlq`, and Rust workspace/Nx targets exist for
    `data-ingestion` and `common-rs`
- Feature Engineering:
  - Rust `feature-engineering` service consumes final `market.raw.data` bars,
    warms rolling indicator state from Data Ingestion gRPC, computes the core
    indicator set, and publishes protobuf `IndicatorFeatureVector` events to
    `features.indicators`
  - deterministic feature-vector ids, Kafka metadata headers, shared topic and
    schema constants, Prometheus metrics, DLQ handling, and e2e coverage for
    duplicate raw-bar idempotency are implemented
- Strategy and Risk Configuration (this iteration):
  - `Strategy` model: create, update, list, get, and assign to portfolio; named
    profiles with `allowedSides`, `minIntervalSecs`, and `activeTimeStart`/`activeTimeEnd`
  - Strategy signal filter evaluated before numeric risk rules in the portfolio
    stage: `STRATEGY_SIDE_FILTER`, `STRATEGY_TIME_FILTER`, `STRATEGY_COOLDOWN_FILTER`
  - Expanded risk rules: `MAX_OPEN_TRADES_EXCEEDED` (per `maxOpenTrades`) and
    `DAILY_LOSS_LIMIT_EXCEEDED` (per `maxDailyLossNotional`) in portfolio-instrument config
  - `AutoDisableService` writes a disable record and a `RiskConfigAuditLog` entry
    after `maxConsecutiveRejections` consecutive rejections
  - `UpdatePortfolio` and `UpdatePortfolioInstrumentConfig` gRPC methods exposed
    via `PATCH /api/portfolios/:portfolioId` and
    `PATCH /api/portfolios/:portfolioId/instrument/:instrumentId`
  - `RiskConfigAuditLog` table with field-level change tracking, exposed via
    `ListRiskConfigAuditLog` gRPC and `GET /api/portfolios/:portfolioId/audit`
  - `ListRiskDecisions` gRPC and `GET /api/portfolios/:portfolioId/decisions` for
    paginated risk decision history
  - `CreateStrategy`, `UpdateStrategy`, `GetStrategy`, `ListStrategies`, and
    `AssignStrategyToPortfolio` gRPC methods exposed via REST strategy endpoints
  - Dashboard: instrument enable/disable toggle, portfolio settings editor,
    risk decision history view, config change audit log view, and strategy
    management (list, detail, create, edit, assign, badge display in portfolio summary)
  - E2E: `risk-config-update`, `risk-rejection`, `instrument-enable-disable`,
    and `strategy-signal-filter` Playwright specs
  - Shared REST name enums (`AssetClassName`, `OrderStatusName`, `SignalSideName`)
    and proto↔REST mapper functions moved to `libs/common` and consumed everywhere

- Prediction Engine and signal visibility:
  - Python `prediction-engine` service consumes `features.indicators`, runs the
    deterministic `baseline-core-v1` model, skips neutral decisions, and
    publishes `common.Signal` events to `trading.signals`
  - recent BUY/SELL signals are cached in Redis and exposed through the
    existing `Signals.GetLatestSignals` gRPC API
  - API Gateway exposes `GET /api/signals?instrumentId=&limit=` and Dashboard
    shows a compact Recent Signals view through API Gateway only
  - full-system e2e now drives raw bars through Feature Engineering, Prediction
    Engine, Portfolio Manager, Execution Engine, API Gateway, and Dashboard;
    synthetic `trading.signals` publishing remains available only as
    test-harness fallback code

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
npx nx run external-api-facade:typecheck
npx nx run external-api-facade:test
npx nx run data-ingestion:fmt
npx nx run data-ingestion:lint
npx nx run data-ingestion:test
npx nx run data-ingestion:test-integration  # requires: npx nx run infra:serve-integration
npx nx run feature-engineering:fmt
npx nx run feature-engineering:lint
npx nx run feature-engineering:test
npx nx run common-python:lint
npx nx run common-python:typecheck
npx nx run common-python:test
npx nx run prediction-engine:fmt
npx nx run prediction-engine:lint
npx nx run prediction-engine:typecheck
npx nx run prediction-engine:test
```

## Post-MVP Roadmap

These items are intentionally grouped by capability rather than sprint-sized
iterations.

### Prediction and Feature Pipeline

The baseline prediction and feature pipeline is complete; all four major
milestones are recorded in the Completed Backend Baseline section above.

- [ ] Feature persistence/read API. Missing. The v1 Feature Engineering service
      keeps rolling state in memory and publishes Kafka output only.
- [ ] Model registry and training pipeline once prediction logic needs
      lifecycle management. Missing beyond the planned local deterministic
      baseline model.
- [ ] Cross-instrument correlations. Missing. Current indicators are
      per-instrument/per-interval only.

### Strategy and Risk Configuration

Strategy/risk configuration APIs, dashboard views, expanded risk rules, and
audit log are complete;

- [ ] Start/stop trading controls. Not yet implemented.

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
   Prediction Engine path is unavailable or intentionally bypassed.
4. Continue using shared proto contracts, topic constants, and key helpers.
5. Every new event-producing feature must preserve deterministic keys,
   idempotency identity, and documented replay behavior.
6. Use `nx` targets for tests, builds, linting, typechecks, and e2e validation.
