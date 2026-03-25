import { type KafkaTopic } from './kafka-topics';

export const KAFKA_EVENT_HEADER_NAMES = {
  EVENT_ID: 'event-id',
  EVENT_TYPE: 'event-type',
  SCHEMA_VERSION: 'schema-version',
  OCCURRED_AT: 'occurred-at',
  PRODUCER: 'producer',
  CONTENT_TYPE: 'content-type',
} as const;

export const KAFKA_EVENT_CONTENT_TYPES = {
  PROTOBUF: 'application/x-protobuf',
} as const;

export const KAFKA_EVENT_PRODUCERS = {
  PORTFOLIO_MANAGER: 'portfolio-manager',
} as const;

export const KAFKA_EVENT_SCHEMA_VERSIONS = {
  INSTRUMENT_REGISTERED: '1',
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
}

export const buildEventMetadataHeaders = ({
  eventId,
  eventType,
  schemaVersion,
  occurredAt,
  producer,
  contentType = KAFKA_EVENT_CONTENT_TYPES.PROTOBUF,
}: BuildEventMetadataHeadersInput): Record<string, string> => ({
  [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: eventId,
  [KAFKA_EVENT_HEADER_NAMES.EVENT_TYPE]: eventType,
  [KAFKA_EVENT_HEADER_NAMES.SCHEMA_VERSION]: schemaVersion,
  [KAFKA_EVENT_HEADER_NAMES.OCCURRED_AT]: occurredAt,
  [KAFKA_EVENT_HEADER_NAMES.PRODUCER]: producer,
  [KAFKA_EVENT_HEADER_NAMES.CONTENT_TYPE]: contentType,
});
