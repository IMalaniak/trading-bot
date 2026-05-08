# Trading Bot MVP Roadmap

## Purpose

This document tracks what remains before the trading bot is a demo-able MVP. It
replaces the original implementation iteration plan now that Iterations 1-6 are
complete.

The backend MVP foundation is already in place. The remaining MVP work should
make that foundation visible to a user, prove the full local flow with e2e
automation, and leave one reproducible demo path for future contributors.

## Completed Backend Baseline

Iterations 1-6 are treated as complete and should not be repeated as active
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
    `GET /api/portfolio/:portfolioId?recentOrdersLimit=20`
- Reliability and operability:
  - shared Kafka consumer retry/DLQ wrapper
  - per-topic DLQs for implemented consumers
  - Prometheus metrics endpoints
  - reliability runbooks for replay, stuck outbox inspection, DLQ drain, and
    local failure drills

Current backend validation remains:

```bash
npx nx run common:test
npx nx run api-gateway:test
npx nx run portfolio-manager:test
npx nx run execution-engine:test
npx nx run portfolio-manager:test-integration
npx nx run execution-engine:test-integration
npx nx run-many -t test -p common,api-gateway,portfolio-manager,execution-engine
```

## Remaining MVP Iterations

### Iteration 7: React Dashboard Demo Console

Goal: add a minimal user-facing console that makes the implemented backend
flow observable without expanding the product API surface.

Scope:

- New planned Nx React dashboard app.
- Default portfolio ID: `portfolio-alpha`, with an editable portfolio ID input.
- Portfolio summary view:
  - portfolio name, active state, exposure cap, aggregate exposure, open
    position count, and last update time
- Open positions view:
  - instrument summary, quantity, average entry price, exposure, and last fill
- Recent orders/fills view:
  - order status, side, requested size, reference price, timestamps, nested
    fills, and instrument enrichment when present
- Register instrument form using:
  - `POST /api/portfolio/register-instrument`
- Portfolio refresh using:
  - `GET /api/portfolio/:portfolioId?recentOrdersLimit=20`
- Loading, empty, validation, and upstream error states.

Out of scope:

- Signal injection UI.
- Trading start/stop controls.
- Strategy editor or risk-rule configuration UI.
- Market charts, signal monitor, websocket streaming, and auth.
- List-portfolios API.

Acceptance criteria:

- A user can open the dashboard, inspect `portfolio-alpha`, refresh it, and see
  positions plus recent simulated execution orders after the backend flow runs.
- A user can register an instrument from the UI and receive a clear success or
  error state.
- The UI uses existing API Gateway product endpoints only.
- No product API endpoint is added solely to publish test signals.

Suggested validation commands:

```bash
npx nx run dashboard:test
npx nx run dashboard:lint
npx nx run dashboard:typecheck
npx nx run dashboard:build
```

### Iteration 8: Full Demo-Path E2E Tests

Goal: prove the MVP as one local system, from synthetic signal input through
backend reconciliation and browser-visible dashboard state.

Scope:

- Add a dedicated e2e test target or project that runs through Nx.
- Start isolated infra equivalent to the existing integration stack.
- Run required database migrations and seed data.
- Start `portfolio-manager`, `execution-engine`, `api-gateway`, and the
  dashboard.
- Publish synthetic `common.Signal` protobuf messages directly to
  `trading.signals` through the e2e test harness.
- Wait for:
  - risk decision output
  - execution simulator lifecycle
  - fill reconciliation
  - updated portfolio read response
- Verify the REST API response for `portfolio-alpha`.
- Verify the dashboard renders the updated summary, position, recent order, and
  fill state in a real browser.
- Include one replay/idempotency check where practical:
  - duplicate source signal does not create duplicate approved trades, or
  - duplicate fill does not mutate portfolio state twice

Important boundary:

- Direct signal publishing is e2e test harness behavior. It is not a product
  API and should not be exposed in the dashboard.

Acceptance criteria:

- One command can run the full local demo-path e2e suite.
- The e2e suite uses shared proto encoders and Kafka topic/key helpers.
- The e2e suite fails if the backend event chain works but the dashboard cannot
  render the resulting state.
- The e2e suite is documented with startup assumptions and teardown behavior.

Suggested validation command:

```bash
npx nx run trading-bot-e2e:e2e
```

### Iteration 9: MVP Demo Polish and Documentation

Goal: make the MVP reproducible for a developer or reviewer starting from a
clean checkout.

Scope:

- Add one canonical local demo walkthrough:
  - install dependencies
  - start infra
  - migrate databases
  - seed demo data
  - start services
  - start dashboard
  - run full e2e or manual signal publish
  - inspect portfolio state in the UI
- Normalize env examples for:
  - root API Gateway config
  - `portfolio-manager`
  - `execution-engine`
  - dashboard
  - integration/e2e stack
- Update runbooks where the e2e harness changes local replay or smoke-test
  workflows.
- Add a clear MVP limitations section.

Known MVP limitations to document:

- No real Prediction Engine.
- No market data ingestion.
- No Feature Engineering service.
- No real exchange or paper exchange execution.
- No auth, users, or permissions.
- No websocket/live dashboard stream.
- No production deployment story.
- No schema registry.

Acceptance criteria:

- A clean local setup can reproduce the demo without relying on undocumented
  commands.
- Docs distinguish product APIs from test harness signal publishing.
- Docs link the roadmap, architecture, C4 model, infra notes, and reliability
  runbooks where relevant.

## Post-MVP Roadmap

These items are intentionally grouped by capability rather than sprint-sized
iterations.

### Market Data and Exchange Integration

- External API Facade for exchange connectivity.
- Data Ingestion service consuming `instrument.registered`.
- Raw market data publishing on `market.raw.data`.
- TimescaleDB-backed historical market data reads.
- Exchange sandbox or paper trading mode before real order placement.

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

## Roadmap Working Rules

1. Keep the remaining MVP focused on proving the implemented backend path.
2. Prefer existing API Gateway product endpoints for UI work.
3. Keep synthetic signal publishing inside e2e/manual demo tooling until a real
   Prediction Engine exists.
4. Continue using shared proto contracts, topic constants, and key helpers.
5. Every new event-producing feature must preserve deterministic keys,
   idempotency identity, and documented replay behavior.
6. Use `nx` targets for tests, builds, linting, typechecks, and e2e validation.
