import {
  DeadLetterEvent,
  IndicatorFeatureVector,
  OrderFill,
  OrderPlaced,
  OrderStatus,
  PortfolioUpdated,
  Signal,
  SignalSide,
  TradeDecision,
  TradeDecisionKind,
} from '../../proto';
import {
  buildEventMetadataHeaders,
  childKafkaEventContext,
  deadLetterTopicFor,
  instrumentKey,
  KAFKA_EVENT_CONTENT_TYPES,
  KAFKA_EVENT_HEADER_NAMES,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
  nextKafkaOffset,
  portfolioKey,
  readRequiredKafkaHeader,
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
      [KAFKA_EVENT_HEADER_NAMES.CORRELATION_ID]: 'event-1',
    });
  });

  it('propagates correlation, causation, and trace headers', () => {
    const childContext = childKafkaEventContext(
      {
        eventId: 'source-event-1',
        correlationId: 'workflow-1',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
      },
      'child-event-1',
    );

    expect(
      buildEventMetadataHeaders({
        eventId: 'child-event-1',
        eventType: KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO,
        schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.TRADING_SIGNALS_PORTFOLIO,
        occurredAt: '2026-03-22T12:34:56.789Z',
        producer: KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
        ...childContext,
      }),
    ).toEqual(
      expect.objectContaining({
        [KAFKA_EVENT_HEADER_NAMES.CORRELATION_ID]: 'workflow-1',
        [KAFKA_EVENT_HEADER_NAMES.CAUSATION_ID]: 'source-event-1',
        [KAFKA_EVENT_HEADER_NAMES.TRACEPARENT]:
          '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
      }),
    );
  });

  it('maps source topics to per-topic dead-letter topics', () => {
    expect(deadLetterTopicFor(KAFKA_TOPICS.TRADING_SIGNALS)).toBe(
      KAFKA_TOPICS.TRADING_SIGNALS_DLQ,
    );
    expect(deadLetterTopicFor(KAFKA_TOPICS.FEATURES_INDICATORS)).toBe(
      KAFKA_TOPICS.FEATURES_INDICATORS_DLQ,
    );
    expect(deadLetterTopicFor(KAFKA_TOPICS.TRADES_APPROVED)).toBe(
      KAFKA_TOPICS.TRADES_APPROVED_DLQ,
    );
  });

  it('reads required Kafka headers and advances offsets', () => {
    expect(
      readRequiredKafkaHeader(
        {
          [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: Buffer.from('event-1'),
        },
        KAFKA_EVENT_HEADER_NAMES.EVENT_ID,
      ),
    ).toBe('event-1');
    expect(nextKafkaOffset('41')).toBe('42');
    expect(() => readRequiredKafkaHeader({}, 'missing')).toThrow(
      "Missing required Kafka header 'missing'",
    );
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

  it('round-trips execution order lifecycle decimal fields as strings', () => {
    const signal = Signal.fromPartial({
      id: 'signal-1',
      instrumentId: 'instrument-1',
      side: SignalSide.SELL,
      price: 100,
      timestamp: 1775044800000,
    });
    const placed = OrderPlaced.fromPartial({
      orderId: 'ord_abc',
      approvalEventId: 'approval-1',
      sourceEventId: 'source-1',
      candidateIdempotencyKey: 'source-1:portfolio-1',
      portfolioId: 'portfolio-1',
      signal,
      requestedNotional: '100.000000000000000001',
      requestedQuantity: '0.333333333333333333',
      referencePrice: '300.000000000000000003',
      status: OrderStatus.PLACED,
      placedAt: '2026-03-22T12:34:57.789Z',
    });
    const fill = OrderFill.fromPartial({
      fillId: 'ord_abc:fill:1',
      orderId: placed.orderId,
      approvalEventId: placed.approvalEventId,
      sourceEventId: placed.sourceEventId,
      candidateIdempotencyKey: placed.candidateIdempotencyKey,
      portfolioId: placed.portfolioId,
      signal,
      sequence: 1,
      fillNotional: '50.000000000000000001',
      fillQuantity: '0.166666666666666667',
      fillPrice: '300.000000000000000003',
      cumulativeFilledNotional: '50.000000000000000001',
      cumulativeFilledQuantity: '0.166666666666666667',
      orderStatus: OrderStatus.PARTIALLY_FILLED,
      filledAt: '2026-03-22T12:34:58.789Z',
    });

    const decodedPlaced = OrderPlaced.decode(
      OrderPlaced.encode(placed).finish(),
    );
    const decodedFill = OrderFill.decode(OrderFill.encode(fill).finish());

    expect(decodedPlaced.requestedNotional).toBe('100.000000000000000001');
    expect(decodedPlaced.status).toBe(OrderStatus.PLACED);
    expect(decodedFill.fillQuantity).toBe('0.166666666666666667');
    expect(decodedFill.orderStatus).toBe(OrderStatus.PARTIALLY_FILLED);
  });

  it('round-trips portfolio update decimal fields as strings', () => {
    const update = PortfolioUpdated.fromPartial({
      portfolioId: 'portfolio-1',
      sourceFillId: 'ord_abc:fill:1',
      orderId: 'ord_abc',
      instrumentId: 'instrument-1',
      aggregateExposureNotional: '150.000000000000000001',
      openPositionCount: 1,
      changedPositionQuantity: '0.500000000000000001',
      changedPositionAverageEntryPrice: '300.000000000000000003',
      changedPositionExposureNotional: '150.000000000000000004',
      updatedAt: '2026-03-22T12:34:58.789Z',
    });

    const decoded = PortfolioUpdated.decode(
      PortfolioUpdated.encode(update).finish(),
    );

    expect(decoded.aggregateExposureNotional).toBe('150.000000000000000001');
    expect(decoded.changedPositionQuantity).toBe('0.500000000000000001');
    expect(decoded.changedPositionAverageEntryPrice).toBe(
      '300.000000000000000003',
    );
    expect(decoded.changedPositionExposureNotional).toBe(
      '150.000000000000000004',
    );
  });

  it('round-trips indicator feature vectors with decimal values as strings', () => {
    const vector = IndicatorFeatureVector.fromPartial({
      id: 'feat:inst-1:1m:1775044800000:core-v1',
      instrumentId: 'inst-1',
      symbol: 'BTCUSDT',
      venue: 'BINANCE',
      interval: '1m',
      openTimeMs: 1775044800000,
      closeTimeMs: 1775044859999,
      sourceEventId: 'market-event-1',
      featureSet: 'core-v1',
      features: [
        { name: 'rsi.close.14', value: '55.123456789012345678' },
        { name: 'macd.close.12_26_9', value: '-1.250000000000000001' },
      ],
      calculatedAt: '2026-03-22T12:34:56.789Z',
    });

    const decoded = IndicatorFeatureVector.decode(
      IndicatorFeatureVector.encode(vector).finish(),
    );

    expect(decoded.id).toBe('feat:inst-1:1m:1775044800000:core-v1');
    expect(decoded.sourceEventId).toBe('market-event-1');
    expect(decoded.featureSet).toBe('core-v1');
    expect(decoded.features).toEqual([
      { name: 'rsi.close.14', value: '55.123456789012345678' },
      { name: 'macd.close.12_26_9', value: '-1.250000000000000001' },
    ]);
  });

  it('defines feature-engineering metadata constants', () => {
    expect(KAFKA_EVENT_PRODUCERS.FEATURE_ENGINEERING).toBe(
      'feature-engineering',
    );
    expect(KAFKA_EVENT_SCHEMA_VERSIONS.FEATURES_INDICATORS).toBe('1');

    expect(
      buildEventMetadataHeaders({
        eventId: 'feature-event-1',
        eventType: KAFKA_TOPICS.FEATURES_INDICATORS,
        schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.FEATURES_INDICATORS,
        occurredAt: '2026-03-22T12:34:56.789Z',
        producer: KAFKA_EVENT_PRODUCERS.FEATURE_ENGINEERING,
        correlationId: 'workflow-1',
        causationId: 'market-event-1',
      }),
    ).toEqual(
      expect.objectContaining({
        [KAFKA_EVENT_HEADER_NAMES.EVENT_TYPE]: KAFKA_TOPICS.FEATURES_INDICATORS,
        [KAFKA_EVENT_HEADER_NAMES.PRODUCER]:
          KAFKA_EVENT_PRODUCERS.FEATURE_ENGINEERING,
        [KAFKA_EVENT_HEADER_NAMES.CORRELATION_ID]: 'workflow-1',
        [KAFKA_EVENT_HEADER_NAMES.CAUSATION_ID]: 'market-event-1',
      }),
    );
  });

  it('round-trips dead-letter events with original bytes and headers', () => {
    const deadLetter = DeadLetterEvent.fromPartial({
      originalTopic: KAFKA_TOPICS.ORDERS_FILLS,
      originalPartition: 2,
      originalOffset: '42',
      originalKey: 'portfolio-alpha',
      originalValue: Buffer.from([1, 2, 3]),
      originalHeaders: [
        { name: KAFKA_EVENT_HEADER_NAMES.EVENT_ID, value: 'fill-event-1' },
      ],
      service: KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
      consumerGroup: 'portfolio-manager-order-fills',
      attempts: 5,
      failureClass: 'Error',
      errorMessage: 'boom',
      firstFailedAt: '2026-03-22T12:34:56.789Z',
      deadLetteredAt: '2026-03-22T12:35:01.789Z',
      correlationId: 'workflow-1',
      causationId: 'fill-event-1',
    });

    const decoded = DeadLetterEvent.decode(
      DeadLetterEvent.encode(deadLetter).finish(),
    );

    expect(decoded.originalValue).toEqual(Buffer.from([1, 2, 3]));
    expect(decoded.originalHeaders).toEqual([
      { name: KAFKA_EVENT_HEADER_NAMES.EVENT_ID, value: 'fill-event-1' },
    ]);
    expect(decoded.correlationId).toBe('workflow-1');
  });
});
