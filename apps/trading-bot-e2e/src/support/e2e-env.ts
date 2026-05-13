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

const LOCALHOST = '127.0.0.1';

export const SYSTEM_PORTS = {
  apiGateway: readEnvInt('API_GATEWAY_PORT', 13000),
  dashboard: readEnvInt('DASHBOARD_PORT', 14200),
  executionMetrics: readEnvInt('EXECUTION_METRICS_PORT', 19102),
  portfolioMetrics: readEnvInt('PORTFOLIO_METRICS_PORT', 19101),
  externalApiFacadeMetrics: readEnvInt(
    'EXTERNAL_API_FACADE_METRICS_PORT',
    19103,
  ),
  dataIngestionMetrics: readEnvInt('DATA_INGESTION_METRICS_PORT', 19104),
} as const;

export const TIMEOUTS = {
  serviceReadyMs: 120_000,
  systemFlowMs: 60_000,
} as const;

export const URLS = {
  apiBase: readEnv(
    'VITE_API_BASE_URL',
    `http://${LOCALHOST}:${SYSTEM_PORTS.apiGateway}/api`,
  ),
  apiGatewayMetrics: `http://${LOCALHOST}:${SYSTEM_PORTS.apiGateway}/metrics`,
  dashboard: `http://${LOCALHOST}:${SYSTEM_PORTS.dashboard}`,
  executionMetrics: `http://${LOCALHOST}:${SYSTEM_PORTS.executionMetrics}/metrics`,
  portfolioMetrics: `http://${LOCALHOST}:${SYSTEM_PORTS.portfolioMetrics}/metrics`,
  externalApiFacadeMetrics: `http://${LOCALHOST}:${SYSTEM_PORTS.externalApiFacadeMetrics}/metrics`,
  dataIngestionMetrics: `http://${LOCALHOST}:${SYSTEM_PORTS.dataIngestionMetrics}/metrics`,
} as const;

export const KAFKA_BROKERS = readEnv('KAFKA_BROKERS', `${LOCALHOST}:29092`);
