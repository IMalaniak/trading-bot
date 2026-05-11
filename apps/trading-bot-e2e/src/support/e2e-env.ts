const readEnv = (name: string, fallback: string): string =>
  process.env[name] ?? fallback;

const readEnvInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value)) {
    throw new Error(`Expected ${name} to be an integer, received '${raw}'.`);
  }

  return value;
};

export const SYSTEM_PORTS = {
  apiGateway: readEnvInt('API_GATEWAY_PORT', 13000),
  dashboard: readEnvInt('DASHBOARD_PORT', 14200),
  executionGrpc: readEnvInt('EXECUTION_GRPC_PORT', 15052),
  executionMetrics: readEnvInt('EXECUTION_METRICS_PORT', 19102),
  kafka: readEnvInt('KAFKA_PORT', 19092),
  portfolioGrpc: readEnvInt('PORTFOLIO_GRPC_PORT', 15051),
  portfolioMetrics: readEnvInt('PORTFOLIO_METRICS_PORT', 19101),
  postgres: readEnvInt('POSTGRES_PORT', 15432),
} as const;

const kafkaHost = readEnv('KAFKA_HOST', '127.0.0.1');

export const TIMEOUTS = {
  serviceReadyMs: 120_000,
  systemFlowMs: 60_000,
} as const;

export const URLS = {
  apiBase: readEnv(
    'VITE_API_BASE_URL',
    `http://127.0.0.1:${SYSTEM_PORTS.apiGateway}/api`,
  ),
  apiGatewayMetrics: `http://127.0.0.1:${SYSTEM_PORTS.apiGateway}/metrics`,
  dashboard: `http://127.0.0.1:${SYSTEM_PORTS.dashboard}`,
  executionMetrics: `http://127.0.0.1:${SYSTEM_PORTS.executionMetrics}/metrics`,
  portfolioMetrics: `http://127.0.0.1:${SYSTEM_PORTS.portfolioMetrics}/metrics`,
} as const;

export const KAFKA_BROKERS = readEnv(
  'KAFKA_BROKERS',
  `${kafkaHost}:${SYSTEM_PORTS.kafka}`,
);
