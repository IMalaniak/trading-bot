Local infra for trading-bot

This folder contains the Docker Compose setups and Redpanda bootstrap assets used by the project.

Compose files

- `infra/docker-compose.base.yml`
  - shared services definition for Redpanda, topic bootstrap, and Postgres
- `infra/docker-compose.yml`
  - local development stack built from the shared base via `extends`
- `infra/docker-compose.test.yml`
  - isolated integration-test stack built from the shared base via `extends`

Services

- `redpanda`: Kafka-compatible broker for local event flows
- `postgres`: main application database used by `portfolio-manager`
- `timescaledb`: time-series database reserved for planned market data workloads

Ports

- Redpanda: `9092`
- Postgres: `5432`
- TimescaleDB: `5433`

Environment files

- `infra/.env`
  - Docker Compose credentials for Postgres and TimescaleDB
- `infra/.env.test-integration`
  - Nx-loaded isolated integration Docker Compose ports
- `infra/.env.e2e`
  - Nx-loaded isolated e2e Docker Compose project and ports
- `infra/.env.example`
  - Example values for the infra credentials
- root `.env`
  - `PORTFOLIO_MANAGER_GRPC_URL`
  - `KAFKA_BROKERS`
  - optional `PORT` for `api-gateway`
- `apps/portfolio-manager/.env`
  - `DATABASE_URL`
- `apps/portfolio-manager/.env.test-integration`
  - Nx-loaded app env for portfolio-manager integration migrations and tests
- `apps/execution-engine/.env.test-integration`
  - Nx-loaded app env for execution-engine integration migrations and tests

Recommended local workflow

1. Start infra:

```bash
npx nx run infra:serve
```

2. Apply database migrations:

```bash
npx nx run portfolio-manager:migrate
```

3. Topics are bootstrapped automatically by the one-shot `redpanda-init` service. If you need to rerun that provisioning manually:

```bash
npx nx run infra:serve
```

4. Start the apps:

```bash
npx nx serve portfolio-manager
npx nx serve api-gateway
```

5. Validate the automated acceptance path:

```bash
npx nx run portfolio-manager:test-integration
```

The integration target depends on the shared `infra:serve-integration` Nx task.
Nx runs that task once per command invocation even when multiple projects run
`test-integration`. The task uses the isolated `infra/docker-compose.test.yml`
stack, not the shared local development stack. It starts Redpanda on `19092`
and Postgres on `15432`, bootstraps topics via `redpanda-init`, runs the owning
service's migrations, and then executes the integration Vitest suite.

Isolated integration stack

- Start only the isolated test infra:

```bash
npx nx run infra:serve-integration:test-integration
```

- Run migrations against the isolated test Postgres:

```bash
npx nx run portfolio-manager:migrate:test-integration
```

- Run only the integration Vitest suite against the isolated test infra:

```bash
npx nx run portfolio-manager:test-integration
```

- Tear the isolated stack down manually:

```bash
npx nx run infra:stop-integration:test-integration
```

`portfolio-manager:test-integration` and `execution-engine:test-integration`
depend on `infra:serve-integration` through `nx.json` target defaults, then run
their own `migrate:test-integration` targets before the integration Vitest
suites. They do not tear the stack down automatically.

Why topic provisioning lives in infra

- Local Redpanda auto-creation is disabled.
- Topic names and local broker defaults are defined under `infra/`, not in application source code.
- `redpanda-init` provisions the local topic set with:
  - partitions: `3`
  - replication factor: `1`
  - cleanup policy: `delete`

Basic compose commands

- Validate compose file:

```bash
docker compose -f infra/docker-compose.yml config
```

- Show Redpanda logs:

```bash
docker compose -f infra/docker-compose.yml logs -f redpanda
```

- Stop and remove:

```bash
docker compose -f infra/docker-compose.yml down -v
```

Manual registration smoke

1. Start infra and both apps.
2. Call `POST /portfolio/register-instrument` on `api-gateway`.
3. Consume from `instrument.registered` with `rpk` or another Kafka client.
4. Verify:
   - topic is `instrument.registered`
   - key is `<VENUE>:<instrument_id>`
   - headers include `event-id`, `event-type`, `schema-version`, `occurred-at`, `producer`, `content-type`
   - payload decodes as `InstrumentRegistered`

Kafka inspection and cleanup

- Consume the next fresh event only:

```bash
docker compose -f infra/docker-compose.yml exec -T redpanda \
  rpk topic consume instrument.registered -o end -n 1
```

- Read the latest existing event:

```bash
docker compose -f infra/docker-compose.yml exec -T redpanda \
  rpk topic consume instrument.registered -o -1 -n 1
```

- Show key, headers, and protobuf payload bytes as hex:

```bash
docker compose -f infra/docker-compose.yml exec -T redpanda \
  rpk topic consume instrument.registered -o -1 -n 1 \
  -f 'key=%k\npartition=%p offset=%o\nheaders:\n%h{  %k=%v\n}value_hex=%v{hex}\n'
```

- Trim all readable history for `instrument.registered` up to the current end offset:

```bash
docker compose -f infra/docker-compose.yml exec -T redpanda \
  rpk topic trim-prefix instrument.registered -o end --no-confirm
```

- Fully reset the topic by deleting and recreating it:

```bash
docker compose -f infra/docker-compose.yml exec -T redpanda \
  rpk topic delete instrument.registered

docker compose -f infra/docker-compose.yml run --rm redpanda-init
```

The trim and delete commands are destructive. Only run them if you intend to
discard shared local Kafka history for that topic.

To inspect or wipe Kafka history in the isolated integration stack instead, use
the test compose file:

```bash
docker compose --env-file infra/.env.test-integration -f infra/docker-compose.test.yml exec -T redpanda \
  rpk topic consume instrument.registered -o -1 -n 1

docker compose --env-file infra/.env.test-integration -f infra/docker-compose.test.yml exec -T redpanda \
  rpk topic trim-prefix instrument.registered -o end --no-confirm
```

Notes

- Local Redpanda uses plaintext listeners only. Do not reuse this setup in production.
- The integration test exercises the real `portfolio-manager` module against local Postgres and Kafka.
