# Trading Bot E2E

`trading-bot-e2e` is the full-system end-to-end regression suite. It owns an
isolated local system for each run: Redpanda, Postgres, service migrations, seed
data, backend service processes, the API Gateway, and the dashboard.

Run the suite with:

```bash
npx nx run trading-bot-e2e:e2e
```

The `e2e` target is wired as Nx project flow. It cleans stale local state before
startup through `infra:serve-e2e`, starts infrastructure and services through
target dependencies, waits for readiness through the `e2e-ready` target, then
runs Playwright through the `@nx/playwright:playwright` executor. Cleanup is an
explicit Nx target on the `infra` project so it can run after Nx has stopped its
continuous service targets:

```bash
npx nx run infra:clean-e2e:e2e
```

CI runs `infra:clean-e2e:e2e` in an `always()` step after the e2e target. Runtime
values are loaded by Nx from `infra/.env.e2e` for Docker Compose lifecycle,
from `apps/trading-bot-e2e/.env.e2e` for harness behavior, and from each app's
`.env.e2e` file for e2e target configurations. The dependency layer delegates
to app-owned `serve-e2e` targets after migrations and seed have completed.
Backend services use `@nx/js:node`; the dashboard uses `@nx/vite:dev-server`.
The suite is intentionally run through the serial `e2e` target in CI because it
owns one shared local system. It uses the integration stack ports by default:

- Kafka: `127.0.0.1:19092`
- Postgres: `127.0.0.1:15432`
- API Gateway: `127.0.0.1:13000`
- Dashboard: `127.0.0.1:14200`

Synthetic signal publishing and duplicate fill replay are test harness behavior
only. They are not product APIs and are intentionally kept out of the dashboard.
The harness producer reads `KAFKA_BROKERS` from
`apps/trading-bot-e2e/.env.e2e`, otherwise it derives the broker from
`KAFKA_HOST:KAFKA_PORT`.
