import {
  Signal,
  SignalSide,
  TradeDecision,
  TradeDecisionKind,
} from '../../proto';
import {
  buildEventMetadataHeaders,
  instrumentKey,
  KAFKA_EVENT_CONTENT_TYPES,
  KAFKA_EVENT_HEADER_NAMES,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
  portfolioKey,
  riskKey,
} from './index';

describe('Kafka contract', () => {
  it('builds deterministic key values', () => {
    expect(instrumentKey('  binance  ', 'instrument-1')).toBe(
      'BINANCE:instrument-1',
    );
    expect(portfolioKey('  portfolio-1  ')).toBe('portfolio-1');
    expect(riskKey('portfolio-1', ' instrument-1 ')).toBe(
      'portfolio-1:instrument-1',
    );
  });

  it('builds the standard metadata header set', () => {
    expect(
      buildEventMetadataHeaders({
        eventId: 'event-1',
        eventType: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
        schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.INSTRUMENT_REGISTERED,
        occurredAt: '2026-03-22T12:34:56.789Z',
        producer: KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
      }),
    ).toEqual({
      [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: 'event-1',
      [KAFKA_EVENT_HEADER_NAMES.EVENT_TYPE]: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
      [KAFKA_EVENT_HEADER_NAMES.SCHEMA_VERSION]:
        KAFKA_EVENT_SCHEMA_VERSIONS.INSTRUMENT_REGISTERED,
      [KAFKA_EVENT_HEADER_NAMES.OCCURRED_AT]: '2026-03-22T12:34:56.789Z',
      [KAFKA_EVENT_HEADER_NAMES.PRODUCER]:
        KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
      [KAFKA_EVENT_HEADER_NAMES.CONTENT_TYPE]:
        KAFKA_EVENT_CONTENT_TYPES.PROTOBUF,
    });
  });

  it('round-trips trade decision decimal fields as strings', () => {
    const decision = TradeDecision.fromPartial({
      signal: Signal.fromPartial({
        id: 'signal-1',
        instrumentId: 'instrument-1',
        side: SignalSide.BUY,
        price: 100,
        timestamp: 1775044800000,
      }),
      sourceEventId: 'source-event-1',
      portfolioId: 'portfolio-1',
      candidateIdempotencyKey: 'source-event-1:portfolio-1',
      decision: TradeDecisionKind.APPROVED,
      requestedNotional: '100.000000000000000001',
      requestedQuantity: '0.333333333333333333',
      referencePrice: '300.000000000000000003',
      decidedAt: '2026-03-22T12:34:56.789Z',
    });

    const decoded = TradeDecision.decode(
      TradeDecision.encode(decision).finish(),
    );

    expect(decoded.requestedNotional).toBe('100.000000000000000001');
    expect(decoded.requestedQuantity).toBe('0.333333333333333333');
    expect(decoded.referencePrice).toBe('300.000000000000000003');
  });
});
