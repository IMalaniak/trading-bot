export const KAFKA_TOPICS = {
  INSTRUMENT_REGISTERED: 'instrument.registered',
  MARKET_RAW_DATA: 'market.raw.data',
  FEATURES_INDICATORS: 'features.indicators',
  TRADING_SIGNALS: 'trading.signals',
  TRADING_SIGNALS_PORTFOLIO: 'trading.signals.portfolio',
  TRADES_APPROVED: 'trades.approved',
  TRADES_REJECTED: 'trades.rejected',
  ORDERS_PLACED: 'orders.placed',
  ORDERS_FILLS: 'orders.fills',
  PORTFOLIO_UPDATED: 'portfolio.updated',
  TRADING_SIGNALS_DLQ: 'trading.signals.dlq',
  TRADING_SIGNALS_PORTFOLIO_DLQ: 'trading.signals.portfolio.dlq',
  TRADES_APPROVED_DLQ: 'trades.approved.dlq',
  ORDERS_FILLS_DLQ: 'orders.fills.dlq',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

const DEAD_LETTER_TOPICS = {
  [KAFKA_TOPICS.TRADING_SIGNALS]: KAFKA_TOPICS.TRADING_SIGNALS_DLQ,
  [KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO]:
    KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO_DLQ,
  [KAFKA_TOPICS.TRADES_APPROVED]: KAFKA_TOPICS.TRADES_APPROVED_DLQ,
  [KAFKA_TOPICS.ORDERS_FILLS]: KAFKA_TOPICS.ORDERS_FILLS_DLQ,
} as const;

export type DeadLetterSourceTopic = keyof typeof DEAD_LETTER_TOPICS;

export type DeadLetterTopic =
  (typeof DEAD_LETTER_TOPICS)[DeadLetterSourceTopic];

export const deadLetterTopicFor = (
  topic: DeadLetterSourceTopic,
): DeadLetterTopic => DEAD_LETTER_TOPICS[topic];
