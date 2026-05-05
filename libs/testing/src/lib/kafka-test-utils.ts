import { randomUUID } from 'node:crypto';

import type { Admin, Consumer, IHeaders, Kafka } from 'kafkajs';

type KafkaHeaderValue = IHeaders[string];

export interface RawKafkaCollectorMessage {
  topic: string;
  key: string | undefined;
  headers: Record<string, string | undefined>;
  value: Buffer | null;
}

export interface StartKafkaMessageCollectorInput<TMessage> {
  kafka: Kafka;
  topics: readonly string[];
  groupIdPrefix: string;
  mapMessage: (message: RawKafkaCollectorMessage) => TMessage;
  fromBeginning?: boolean;
  maxWaitTimeInMs?: number;
}

export interface KafkaMessageCollector<TMessage> {
  consumer: Consumer;
  messages: TMessage[];
}

export const kafkaHeaderValueToString = (
  value: KafkaHeaderValue,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        Buffer.isBuffer(item) ? item.toString('utf8') : String(item),
      )
      .join(',');
  }

  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
};

export const kafkaHeadersToRecord = (
  headers: IHeaders | undefined,
): Record<string, string | undefined> =>
  Object.fromEntries(
    Object.entries(headers ?? {}).map(([headerName, value]) => [
      headerName,
      kafkaHeaderValueToString(value),
    ]),
  );

export const truncateTopic = async (
  admin: Admin,
  topic: string,
): Promise<void> => {
  const offsets = await admin.fetchTopicOffsets(topic);

  if (offsets.length === 0) {
    return;
  }

  await admin.deleteTopicRecords({
    topic,
    partitions: offsets.map(({ partition, high }) => ({
      partition,
      offset: high,
    })),
  });
};

export const truncateTopics = async (
  admin: Admin,
  topics: readonly string[],
): Promise<void> => {
  for (const topic of topics) {
    await truncateTopic(admin, topic);
  }
};

export const startKafkaMessageCollector = async <TMessage>({
  kafka,
  topics,
  groupIdPrefix,
  mapMessage,
  fromBeginning = true,
  maxWaitTimeInMs = 100,
}: StartKafkaMessageCollectorInput<TMessage>): Promise<
  KafkaMessageCollector<TMessage>
> => {
  const consumer = kafka.consumer({
    groupId: `${groupIdPrefix}-${randomUUID()}`,
    maxWaitTimeInMs,
  });
  const messages: TMessage[] = [];

  await consumer.connect();
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning });
  }

  await consumer.run({
    eachMessage: ({ topic, message }) => {
      messages.push(
        mapMessage({
          topic,
          key: message.key?.toString('utf8'),
          headers: kafkaHeadersToRecord(message.headers),
          value: message.value,
        }),
      );

      return Promise.resolve();
    },
  });

  return { consumer, messages };
};
