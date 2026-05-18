import { randomUUID } from 'node:crypto';

import { ClientKafka } from '@nestjs/microservices';
import {
  instrumentKey,
  KAFKA_EVENT_CONTENT_TYPES,
  KAFKA_EVENT_HEADER_NAMES,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
} from '@trading-bot/common';
import { MarketDataBar } from '@trading-bot/common/proto';

import type { ParsedBar } from './binance-ws-client';

/**
 * KafkaMarketDataPublisher serialises a parsed Binance kline bar as a
 * protobuf-encoded MarketDataBar and publishes it directly to the
 * `market.raw.data` Kafka topic.
 *
 * Design note: No outbox is used here. Market data is a high-frequency
 * streaming workload — a missed candle is reproduced by the next WebSocket
 * tick, so the durability overhead of an outbox is inappropriate.
 */
export class KafkaMarketDataPublisher {
  constructor(
    private readonly kafkaClient: ClientKafka,
    private readonly instrumentId: string,
  ) {}

  publish(bar: ParsedBar): void {
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();

    const payload: MarketDataBar = {
      instrumentId: this.instrumentId,
      symbol: bar.symbol,
      venue: bar.venue,
      interval: bar.interval,
      openTimeMs: bar.openTimeMs,
      closeTimeMs: bar.closeTimeMs,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      quoteVolume: bar.quoteVolume,
      tradeCount: bar.tradeCount,
      isFinal: bar.isFinal,
    };

    const value = Buffer.from(MarketDataBar.encode(payload).finish());
    const key = instrumentKey(bar.venue, this.instrumentId);

    const headers: Record<string, string> = {
      [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: eventId,
      [KAFKA_EVENT_HEADER_NAMES.EVENT_TYPE]: KAFKA_TOPICS.MARKET_RAW_DATA,
      [KAFKA_EVENT_HEADER_NAMES.SCHEMA_VERSION]:
        KAFKA_EVENT_SCHEMA_VERSIONS.MARKET_RAW_DATA,
      [KAFKA_EVENT_HEADER_NAMES.OCCURRED_AT]: occurredAt,
      [KAFKA_EVENT_HEADER_NAMES.PRODUCER]:
        KAFKA_EVENT_PRODUCERS.EXTERNAL_API_FACADE,
      [KAFKA_EVENT_HEADER_NAMES.CONTENT_TYPE]:
        KAFKA_EVENT_CONTENT_TYPES.PROTOBUF,
    };

    this.kafkaClient.emit(KAFKA_TOPICS.MARKET_RAW_DATA, {
      key,
      value,
      headers,
    });
  }
}
