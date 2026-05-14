import { KAFKA_TOPICS } from '@trading-bot/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ParsedBar } from './binance-ws-client';
import { KafkaMarketDataPublisher } from './kafka-market-data-publisher';

describe('KafkaMarketDataPublisher', () => {
  const emit = vi.fn().mockReturnValue({ subscribe: vi.fn() });
  let publisher: KafkaMarketDataPublisher;

  const sampleBar: ParsedBar = {
    symbol: 'BTCUSDT',
    venue: 'BINANCE',
    interval: '1m',
    openTimeMs: 1_715_000_000_000,
    closeTimeMs: 1_715_000_059_999,
    open: '62000.00',
    high: '62100.00',
    low: '61900.00',
    close: '62050.00',
    volume: '10.5',
    quoteVolume: '651525.00',
    tradeCount: 150,
    isFinal: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    publisher = new KafkaMarketDataPublisher({ emit } as never, 'inst-abc');
  });

  it('should publish to the market.raw.data topic', () => {
    publisher.publish(sampleBar);

    expect(emit).toHaveBeenCalledOnce();
    const [topic] = emit.mock.calls[0] as [string, unknown];
    expect(topic).toBe(KAFKA_TOPICS.MARKET_RAW_DATA);
  });

  it('should use venue:symbol as the Kafka message key', () => {
    publisher.publish(sampleBar);

    const [, message] = emit.mock.calls[0] as [string, { key: string }];
    expect(message.key).toBe('BINANCE:BTCUSDT');
  });

  it('should include required event headers', () => {
    publisher.publish(sampleBar);

    const [, message] = emit.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(message.headers['event-type']).toBe(KAFKA_TOPICS.MARKET_RAW_DATA);
    expect(message.headers['producer']).toBe('external-api-facade');
    expect(message.headers['schema-version']).toBe('1');
    expect(message.headers['content-type']).toBe('application/x-protobuf');
    expect(message.headers['event-id']).toBeTruthy();
    expect(message.headers['occurred-at']).toBeTruthy();
  });

  it('should encode the bar as a protobuf binary value', () => {
    publisher.publish(sampleBar);

    const [, message] = emit.mock.calls[0] as [string, { value: Buffer }];
    expect(Buffer.isBuffer(message.value)).toBe(true);
    expect(message.value.length).toBeGreaterThan(0);
  });
});
