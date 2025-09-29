Local infra for trading-bot

This folder contains a Docker Compose setup for local development services used by the trading-bot project.

Services (current)
- redpanda (Kafka-compatible broker, no Zookeeper) - image: `redpandadata/redpanda:latest` (development)
- postgres (Postgres 17) - image: `postgres:17`
- timescaledb (TimescaleDB for time-series workloads) - image: `timescale/timescaledb:latest-pg17` (or built locally if you changed it)

Ports (host -> container)
- Redpanda (Kafka): 9092 -> 9092
- Postgres: 5432 -> 5432
- TimescaleDB: 5433 -> 5432

Credentials and environment
Credentials are loaded from `infra/.env` which is ignored by git. Check `infra/.env.example` for example values and copy it to `infra/.env` to customize.

Example values (`infra/.env.example`):

```
POSTGRES_USER=trading
POSTGRES_PASSWORD=trading_pass
POSTGRES_DB=trading_db

TIMESCALE_USER=timescale
TIMESCALE_PASSWORD=timescale_pass
TIMESCALE_DB=timescale_db
```

Quick commands
- Validate compose file:
  docker compose -f infra/docker-compose.yml config

- Start services:
  docker compose -f infra/docker-compose.yml up -d

- Show logs (example):
  docker compose -f infra/docker-compose.yml logs -f redpanda

- Stop and remove (including volumes):
  docker compose -f infra/docker-compose.yml down -v

Basic Kafka checks (inside the redpanda container)
- Show cluster/broker info:
  docker compose -f infra/docker-compose.yml exec redpanda rpk cluster info

- Create a topic:
  docker compose -f infra/docker-compose.yml exec -T redpanda rpk topic create test-topic --partitions 1 --replicas 1

- Produce a message:
  echo "hello" | docker compose -f infra/docker-compose.yml exec -T redpanda rpk topic produce test-topic

- Consume a single message:
  docker compose -f infra/docker-compose.yml exec -T redpanda rpk topic consume test-topic -n 1

Notes
- `PLAINTEXT` listeners are used in this compose for local development (no TLS or auth). Do not use PLAINTEXT in production.
- If clients run in other Docker services (same compose network), prefer `--advertise-kafka-addr=PLAINTEXT://redpanda:9092` so other containers can connect via service name.
- `infra/.env` is ignored by git. Use `infra/.env.example` and copy it to `infra/.env`.
