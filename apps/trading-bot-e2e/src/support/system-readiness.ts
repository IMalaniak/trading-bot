import { Kafka, logLevel } from 'kafkajs';

import { KAFKA_BROKERS, TIMEOUTS, URLS } from './e2e-env';

const waitForHttp = async (
  url: string,
  name: string,
  timeoutMs: number = TIMEOUTS.serviceReadyMs,
): Promise<void> => {
  const startedAt = Date.now();
  let lastError = 'not attempted';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${name} at ${url}: ${lastError}`);
};

const waitForKafka = async (
  timeoutMs: number = TIMEOUTS.serviceReadyMs,
): Promise<void> => {
  const startedAt = Date.now();
  let lastError = 'not attempted';

  while (Date.now() - startedAt < timeoutMs) {
    const kafka = new Kafka({
      brokers: KAFKA_BROKERS.split(','),
      clientId: 'trading-bot-e2e-readiness',
      logLevel: logLevel.NOTHING,
    });
    const admin = kafka.admin();

    try {
      await admin.connect();
      await admin.listTopics();
      await admin.disconnect();
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await admin.disconnect().catch(() => undefined);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Timed out waiting for Kafka at ${KAFKA_BROKERS}: ${lastError}`,
  );
};

export const verifySystemReady = async (): Promise<void> => {
  await waitForKafka();
  await waitForHttp(URLS.portfolioMetrics, 'portfolio-manager metrics');
  await waitForHttp(URLS.executionMetrics, 'execution-engine metrics');
  await waitForHttp(URLS.dataIngestionMetrics, 'data-ingestion metrics');
  await waitForHttp(
    URLS.featureEngineeringMetrics,
    'feature-engineering metrics',
  );
  await waitForHttp(
    URLS.externalApiFacadeMetrics,
    'external-api-facade metrics',
  );
  await waitForHttp(`${URLS.apiBase}/portfolios`, 'api-gateway portfolios');
  await waitForHttp(URLS.dashboard, 'dashboard');
};
