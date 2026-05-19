export const KAFKA_TOPICS = {
  INSTRUMENT_REGISTERED: 'instrument.registered',
  INSTRUMENT_REGISTERED_DLQ: 'instrument.registered.dlq',

  MARKET_RAW_DATA: 'market.raw.data',
  MARKET_RAW_DATA_DLQ: 'market.raw.data.dlq',

  TRADING_SIGNALS: 'trading.signals',
  TRADING_SIGNALS_DLQ: 'trading.signals.dlq',

  TRADING_SIGNALS_PORTFOLIO: 'trading.signals.portfolio',
  TRADING_SIGNALS_PORTFOLIO_DLQ: 'trading.signals.portfolio.dlq',

  TRADES_APPROVED: 'trades.approved',
  TRADES_APPROVED_DLQ: 'trades.approved.dlq',

  ORDERS_FILLS: 'orders.fills',
  ORDERS_FILLS_DLQ: 'orders.fills.dlq',

  TRADES_REJECTED: 'trades.rejected',
  ORDERS_PLACED: 'orders.placed',
  FEATURES_INDICATORS: 'features.indicators',
  FEATURES_INDICATORS_DLQ: 'features.indicators.dlq',
  PORTFOLIO_UPDATED: 'portfolio.updated',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

const DEAD_LETTER_TOPICS = {
  [KAFKA_TOPICS.TRADING_SIGNALS]: KAFKA_TOPICS.TRADING_SIGNALS_DLQ,
  [KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO]:
    KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO_DLQ,
  [KAFKA_TOPICS.TRADES_APPROVED]: KAFKA_TOPICS.TRADES_APPROVED_DLQ,
  [KAFKA_TOPICS.ORDERS_FILLS]: KAFKA_TOPICS.ORDERS_FILLS_DLQ,
  [KAFKA_TOPICS.INSTRUMENT_REGISTERED]: KAFKA_TOPICS.INSTRUMENT_REGISTERED_DLQ,
  [KAFKA_TOPICS.MARKET_RAW_DATA]: KAFKA_TOPICS.MARKET_RAW_DATA_DLQ,
  [KAFKA_TOPICS.FEATURES_INDICATORS]: KAFKA_TOPICS.FEATURES_INDICATORS_DLQ,
} as const;

export type DeadLetterSourceTopic = keyof typeof DEAD_LETTER_TOPICS;

export type DeadLetterTopic =
  (typeof DEAD_LETTER_TOPICS)[DeadLetterSourceTopic];

export const deadLetterTopicFor = (
  topic: DeadLetterSourceTopic,
): DeadLetterTopic => DEAD_LETTER_TOPICS[topic];
