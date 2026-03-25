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
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
