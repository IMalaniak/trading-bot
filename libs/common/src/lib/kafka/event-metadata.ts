import { type KafkaTopic } from './kafka-topics';

export const KAFKA_EVENT_HEADER_NAMES = {
  EVENT_ID: 'event-id',
  EVENT_TYPE: 'event-type',
  SCHEMA_VERSION: 'schema-version',
  OCCURRED_AT: 'occurred-at',
  PRODUCER: 'producer',
  CONTENT_TYPE: 'content-type',
  CORRELATION_ID: 'correlation-id',
  CAUSATION_ID: 'causation-id',
  TRACEPARENT: 'traceparent',
} as const;

export const KAFKA_EVENT_CONTENT_TYPES = {
  PROTOBUF: 'application/x-protobuf',
} as const;

export const KAFKA_EVENT_PRODUCERS = {
  PORTFOLIO_MANAGER: 'portfolio-manager',
  PREDICTION_ENGINE: 'prediction-engine',
  FEATURE_ENGINEERING: 'feature-engineering',
  EXECUTION_ENGINE: 'execution-engine',
  EXTERNAL_API_FACADE: 'external-api-facade',
} as const;

export const KAFKA_EVENT_SCHEMA_VERSIONS = {
  INSTRUMENT_REGISTERED: '1',
  TRADING_SIGNALS: '1',
  TRADING_SIGNALS_PORTFOLIO: '1',
  TRADES_APPROVED: '1',
  TRADES_REJECTED: '1',
  ORDERS_PLACED: '1',
  ORDERS_FILLS: '1',
  PORTFOLIO_UPDATED: '1',
  FEATURES_INDICATORS: '1',
  FEATURES_INDICATORS_DLQ: '1',
  TRADING_SIGNALS_DLQ: '1',
  TRADING_SIGNALS_PORTFOLIO_DLQ: '1',
  TRADES_APPROVED_DLQ: '1',
  ORDERS_FILLS_DLQ: '1',
  MARKET_RAW_DATA: '1',
  INSTRUMENT_REGISTERED_DLQ: '1',
  MARKET_RAW_DATA_DLQ: '1',
} as const;

export type KafkaEventProducer =
  (typeof KAFKA_EVENT_PRODUCERS)[keyof typeof KAFKA_EVENT_PRODUCERS];

export interface BuildEventMetadataHeadersInput {
  eventId: string;
  eventType: KafkaTopic;
  schemaVersion: string;
  occurredAt: string;
  producer: KafkaEventProducer;
  contentType?: string;
  correlationId?: string;
  causationId?: string;
  traceparent?: string;
}

export interface KafkaEventContext {
  eventId?: string;
  correlationId?: string;
  causationId?: string;
  traceparent?: string;
}

export const buildEventMetadataHeaders = ({
  eventId,
  eventType,
  schemaVersion,
  occurredAt,
  producer,
  contentType = KAFKA_EVENT_CONTENT_TYPES.PROTOBUF,
  correlationId,
  causationId,
  traceparent,
}: BuildEventMetadataHeadersInput): Record<string, string> => {
  const headers: Record<string, string> = {
    [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: eventId,
    [KAFKA_EVENT_HEADER_NAMES.EVENT_TYPE]: eventType,
    [KAFKA_EVENT_HEADER_NAMES.SCHEMA_VERSION]: schemaVersion,
    [KAFKA_EVENT_HEADER_NAMES.OCCURRED_AT]: occurredAt,
    [KAFKA_EVENT_HEADER_NAMES.PRODUCER]: producer,
    [KAFKA_EVENT_HEADER_NAMES.CONTENT_TYPE]: contentType,
    [KAFKA_EVENT_HEADER_NAMES.CORRELATION_ID]: correlationId ?? eventId,
  };

  if (causationId) {
    headers[KAFKA_EVENT_HEADER_NAMES.CAUSATION_ID] = causationId;
  }

  if (traceparent) {
    headers[KAFKA_EVENT_HEADER_NAMES.TRACEPARENT] = traceparent;
  }

  return headers;
};

const readHeader = (
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined => {
  const value = headers?.[name];

  return value && value.length > 0 ? value : undefined;
};

export const resolveKafkaEventContext = (
  headers: Record<string, string | undefined> | undefined,
  fallbackEventId?: string,
): KafkaEventContext => {
  const eventId = readHeader(headers, KAFKA_EVENT_HEADER_NAMES.EVENT_ID);

  return {
    eventId,
    correlationId:
      readHeader(headers, KAFKA_EVENT_HEADER_NAMES.CORRELATION_ID) ??
      eventId ??
      fallbackEventId,
    causationId: readHeader(headers, KAFKA_EVENT_HEADER_NAMES.CAUSATION_ID),
    traceparent: readHeader(headers, KAFKA_EVENT_HEADER_NAMES.TRACEPARENT),
  };
};

export const childKafkaEventContext = (
  parent: KafkaEventContext | undefined,
  eventId: string,
): Required<Pick<KafkaEventContext, 'correlationId'>> &
  Omit<KafkaEventContext, 'correlationId'> => ({
  eventId,
  correlationId: parent?.correlationId ?? parent?.eventId ?? eventId,
  causationId: parent?.eventId,
  traceparent: parent?.traceparent,
});
