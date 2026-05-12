# trading-bot

## MVP Local Validation

This README is the canonical local walkthrough for validating the MVP from a
clean checkout. The MVP proves the implemented portfolio flow: seeded portfolio
data, Dashboard visibility, instrument configuration through API Gateway, and a
test-harness Kafka signal that drives risk, execution, fill reconciliation, REST
state, and browser-visible Dashboard state.

Synthetic signal publishing is test tooling only. The product surface remains:

- `GET /api/portfolios`
- `GET /api/portfolios/:portfolioId?recentOrdersLimit=20`
- `POST /api/portfolios/:portfolioId/instrument`

### Prerequisites

- Node.js and npm compatible with the checked-in `package-lock.json`
- Docker with Compose v2
- Playwright browser dependencies for the full e2e path
- **Rust toolchain** — install via [rustup](https://rustup.rs/):
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  source "$HOME/.cargo/env"
  ```
  The `rust-toolchain.toml` at repo root pins the exact version; `rustup` auto-installs it on first use.
- **protoc** (Protocol Buffers compiler) — required to compile Rust gRPC stubs:
  ```bash
  brew install protobuf
  ```
- **cmake** — required by `rdkafka-sys` to compile librdkafka:
  ```bash
  brew install cmake
  ```
- **cargo-audit** (optional, for `nx run data-ingestion:audit`):
  ```bash
  cargo install cargo-audit
  ```

Install dependencies:

```bash
npm install
```

Copy local env templates for interactive development:

```bash
cp .env.example .env
cp infra/.env.example infra/.env
cp apps/api-gateway/.env.example apps/api-gateway/.env
cp apps/portfolio-manager/.env.example apps/portfolio-manager/.env
cp apps/execution-engine/.env.example apps/execution-engine/.env
cp apps/dashboard/.env.example apps/dashboard/.env
cp apps/external-api-facade/.env.example apps/external-api-facade/.env
```

The committed `.env.e2e` files provide deterministic defaults for the isolated
full-system e2e stack.

### Path A: Full-System E2E

Run the automated MVP proof:

```bash
npx nx run trading-bot-e2e:e2e
```

This Nx target starts isolated Redpanda and Postgres through `infra:serve-e2e`,
runs service migrations, seeds `portfolio-alpha`, starts `portfolio-manager`,
`execution-engine`, `api-gateway`, and `dashboard`, publishes synthetic
protobuf events from the e2e harness, then verifies both REST state and the
Dashboard in Chromium.

Clean the isolated e2e Docker stack after the run when needed:

```bash
npx nx run infra:clean-e2e:e2e
```

### Path B: Interactive Local Stack

Start shared local infra:

```bash
npx nx run infra:serve
```

Apply migrations and seed baseline portfolio data:

```bash
npx nx run portfolio-manager:migrate
npx nx run execution-engine:migrate
npx nx run portfolio-manager:seed
```

Start the services in separate terminals:

```bash
npx nx serve portfolio-manager
npx nx serve execution-engine
npx nx serve api-gateway
npx nx serve dashboard
```

Open the Dashboard at `http://localhost:4200`, select `portfolio-alpha`, and
inspect the seeded summary and configured instruments. Positions and recent
orders remain empty until a test-harness signal drives the backend event chain.
Use the instrument form to call the API Gateway product endpoint
`POST /api/portfolios/:portfolioId/instrument`.

Stop shared local infra without deleting volumes:

```bash
npx nx run infra:stop
```

Delete shared local infra volumes when you want a clean database and Kafka
history:

```bash
npx nx run infra:clean
```

### Focused Validation

Run focused project checks through Nx:

```bash
npx nx run dashboard:test
npx nx run dashboard:typecheck
npx nx run dashboard:build
npx nx run trading-bot-e2e:test
npx nx run trading-bot-e2e:typecheck
```

Run backend integration suites:

```bash
npx nx run portfolio-manager:test-integration
npx nx run execution-engine:test-integration
```

## MVP Limitations

- No real Prediction Engine.
- No market data ingestion.
- No Feature Engineering service.
- No real exchange or paper exchange execution.
- No auth, users, or permissions.
- No websocket or live Dashboard stream.
- No production deployment story.
- No schema registry.

## Documentation

- Architecture: `docs/architecture/ARCHITECTURE.md`
- C4 workspace: `docs/architecture/c4/workspace.dsl`
  - Run `./scripts/structurizr-lite.sh` to view the C4 diagrams interactively in the browser.
- Infra notes: `infra/README.md`
- Reliability runbooks: `docs/operations/reliability-runbooks.md`
- MVP implementation plan: `docs/implementation/MVP_ITERATION_PLAN.md`
