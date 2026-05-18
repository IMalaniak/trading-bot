import { expect, test } from '@playwright/test';
import {
  instrumentKey,
  KAFKA_EVENT_HEADER_NAMES,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
} from '@trading-bot/common';

import {
  collectFeatureVectors,
  expectedCoreFeatureNames,
  FEATURE_E2E_CORRELATION_ID,
  FEATURE_E2E_EXPECTED_VECTOR_ID,
  FEATURE_E2E_INSTRUMENT_ID,
  FEATURE_E2E_INTERVAL,
  FEATURE_E2E_READY_OPEN_TIME_MS,
  FEATURE_E2E_READY_SOURCE_EVENT_ID,
  FEATURE_E2E_SYMBOL,
  FEATURE_E2E_VENUE,
  featureHeader,
  publishDuplicateReadyFeatureBar,
  publishFeatureEngineeringBars,
  type ReceivedFeatureVector,
  waitForFeatureVectorCount,
} from '../support/feature-engineering-flow';
import { createKafka } from '../support/signal-to-portfolio-flow';

test.describe.configure({ mode: 'serial' });

test('publishes deterministic core feature vectors from final market data bars', async () => {
  const kafka = createKafka();
  const producer = kafka.producer();
  const consumer = kafka.consumer({
    groupId: `trading-bot-e2e-feature-engineering-${Date.now()}`,
  });
  const received: ReceivedFeatureVector[] = [];

  await producer.connect();
  await consumer.connect();
  await collectFeatureVectors(consumer, received);

  try {
    await test.step('publish enough final market.raw.data bars for the core feature window', async () => {
      await publishFeatureEngineeringBars(producer);
    });

    const [first] =
      await test.step('feature-engineering publishes the ready vector', async () => {
        return await waitForFeatureVectorCount(received, 1);
      });

    await test.step('feature vector metadata and feature names match the contract', () => {
      expect(first.key).toBe(
        instrumentKey(FEATURE_E2E_VENUE, FEATURE_E2E_INSTRUMENT_ID),
      );
      expect(first.vector.id).toBe(FEATURE_E2E_EXPECTED_VECTOR_ID);
      expect(first.vector.instrumentId).toBe(FEATURE_E2E_INSTRUMENT_ID);
      expect(first.vector.symbol).toBe(FEATURE_E2E_SYMBOL);
      expect(first.vector.venue).toBe(FEATURE_E2E_VENUE);
      expect(first.vector.interval).toBe(FEATURE_E2E_INTERVAL);
      expect(first.vector.openTimeMs).toBe(FEATURE_E2E_READY_OPEN_TIME_MS);
      expect(first.vector.sourceEventId).toBe(
        FEATURE_E2E_READY_SOURCE_EVENT_ID,
      );
      expect(first.vector.featureSet).toBe('core-v1');
      expect(first.vector.features.map((feature) => feature.name)).toEqual(
        expectedCoreFeatureNames(),
      );
      for (const feature of first.vector.features) {
        expect(feature.value).toMatch(/^-?\d+(\.\d+)?$/);
      }
    });

    await test.step('feature event headers preserve source context', () => {
      expect(featureHeader(first, KAFKA_EVENT_HEADER_NAMES.EVENT_ID)).toBe(
        FEATURE_E2E_EXPECTED_VECTOR_ID,
      );
      expect(featureHeader(first, KAFKA_EVENT_HEADER_NAMES.EVENT_TYPE)).toBe(
        KAFKA_TOPICS.FEATURES_INDICATORS,
      );
      expect(
        featureHeader(first, KAFKA_EVENT_HEADER_NAMES.SCHEMA_VERSION),
      ).toBe(KAFKA_EVENT_SCHEMA_VERSIONS.FEATURES_INDICATORS);
      expect(featureHeader(first, KAFKA_EVENT_HEADER_NAMES.PRODUCER)).toBe(
        KAFKA_EVENT_PRODUCERS.FEATURE_ENGINEERING,
      );
      expect(
        featureHeader(first, KAFKA_EVENT_HEADER_NAMES.CORRELATION_ID),
      ).toBe(FEATURE_E2E_CORRELATION_ID);
      expect(featureHeader(first, KAFKA_EVENT_HEADER_NAMES.CAUSATION_ID)).toBe(
        FEATURE_E2E_READY_SOURCE_EVENT_ID,
      );
    });

    await test.step('duplicate ready raw bar republishes the same deterministic feature id', async () => {
      await publishDuplicateReadyFeatureBar(producer);
      const [, duplicate] = await waitForFeatureVectorCount(received, 2);
      expect(duplicate.vector.id).toBe(first.vector.id);
      expect(duplicate.vector.sourceEventId).toBe(first.vector.sourceEventId);
      expect(featureHeader(duplicate, KAFKA_EVENT_HEADER_NAMES.EVENT_ID)).toBe(
        first.vector.id,
      );
    });
  } finally {
    await consumer.disconnect();
    await producer.disconnect();
  }
});
