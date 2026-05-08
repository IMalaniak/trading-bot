import { DeadLetterEvent } from '../../proto';
import {
  KAFKA_EVENT_HEADER_NAMES,
  KAFKA_EVENT_PRODUCERS,
} from './event-metadata';
import { KAFKA_TOPICS } from './kafka-topics';
import {
  ReliableKafkaConsumer,
  type ReliableKafkaDlqProducer,
} from './reliable-kafka-consumer';

describe('ReliableKafkaConsumer', () => {
  let commitOffset: jest.Mock;
  let dlqProducer: {
    send: jest.MockedFunction<ReliableKafkaDlqProducer['send']>;
  };
  let logger: { debug: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let metrics: {
    recordConsumerMessage: jest.Mock;
    recordConsumerRetry: jest.Mock;
    recordDeadLetter: jest.Mock;
  };
  let sleeps: number[];
  let nowIndex: number;

  const nowValues = [
    '2026-03-22T12:00:00.000Z',
    '2026-03-22T12:00:01.000Z',
    '2026-03-22T12:00:02.000Z',
    '2026-03-22T12:00:03.000Z',
    '2026-03-22T12:00:04.000Z',
    '2026-03-22T12:00:05.000Z',
  ].map((value) => new Date(value));
  const fallbackNow = new Date('2026-03-22T12:00:05.000Z');

  beforeEach(() => {
    commitOffset = jest.fn();
    dlqProducer = {
      send: jest.fn() as jest.MockedFunction<ReliableKafkaDlqProducer['send']>,
    };
    logger = {
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    metrics = {
      recordConsumerMessage: jest.fn(),
      recordConsumerRetry: jest.fn(),
      recordDeadLetter: jest.fn(),
    };
    sleeps = [];
    nowIndex = 0;
  });

  const createConsumer = (
    handle: jest.Mock,
    decode: (value: Buffer) => string = (value) => value.toString('utf8'),
  ) =>
    new ReliableKafkaConsumer({
      service: KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
      consumerGroup: 'portfolio-manager-order-fills',
      sourceTopic: KAFKA_TOPICS.ORDERS_FILLS,
      dlqTopic: KAFKA_TOPICS.ORDERS_FILLS_DLQ,
      decode,
      handle,
      commitOffset,
      dlqProducer,
      logger,
      metrics,
      retryPolicy: {
        maxAttempts: 5,
        retryBaseMs: 250,
        retryMaxMs: 5_000,
      },
      now: () => nowValues[nowIndex++] ?? fallbackNow,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });

  const message = {
    topic: KAFKA_TOPICS.ORDERS_FILLS,
    partition: 1,
    message: {
      key: Buffer.from('portfolio-alpha'),
      value: Buffer.from('payload'),
      headers: {
        [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: Buffer.from('fill-event-1'),
        [KAFKA_EVENT_HEADER_NAMES.CORRELATION_ID]: Buffer.from('workflow-1'),
      },
      offset: '41',
    },
  };

  it('processes and commits successful messages', async () => {
    const handle = jest.fn().mockResolvedValue(undefined);

    await createConsumer(handle).handleMessage(message);

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: 'payload',
        eventId: 'fill-event-1',
        kafkaKey: 'portfolio-alpha',
        eventContext: expect.objectContaining({
          eventId: 'fill-event-1',
          correlationId: 'workflow-1',
        }) as Record<string, unknown>,
      }),
    );
    expect(commitOffset).toHaveBeenCalledWith({
      topic: KAFKA_TOPICS.ORDERS_FILLS,
      partition: 1,
      offset: '42',
    });
    expect(dlqProducer.send).not.toHaveBeenCalled();
    expect(metrics.recordConsumerMessage).toHaveBeenCalledWith(
      {
        topic: KAFKA_TOPICS.ORDERS_FILLS,
        consumerGroup: 'portfolio-manager-order-fills',
      },
      'success',
      expect.any(Number),
    );
  });

  it('retries failed messages, publishes DLQ, then commits the source offset', async () => {
    const handle = jest.fn().mockRejectedValue(new Error('poison message'));

    await createConsumer(handle).handleMessage(message);

    expect(handle).toHaveBeenCalledTimes(5);
    expect(sleeps).toEqual([250, 500, 1000, 2000]);
    expect(dlqProducer.send).toHaveBeenCalledTimes(1);
    expect(commitOffset).toHaveBeenCalledWith({
      topic: KAFKA_TOPICS.ORDERS_FILLS,
      partition: 1,
      offset: '42',
    });

    const dlqSend = dlqProducer.send.mock.calls[0]?.[0];

    if (!dlqSend) {
      throw new Error('Expected a DLQ send call');
    }

    const dlqMessage = dlqSend.messages[0];

    if (!dlqMessage) {
      throw new Error('Expected a DLQ message to be published');
    }

    const deadLetter = DeadLetterEvent.decode(dlqMessage.value);

    expect(dlqSend.topic).toBe(KAFKA_TOPICS.ORDERS_FILLS_DLQ);
    expect(dlqMessage.key).toEqual(Buffer.from('portfolio-alpha'));
    expect(deadLetter).toEqual(
      expect.objectContaining({
        originalTopic: KAFKA_TOPICS.ORDERS_FILLS,
        originalPartition: 1,
        originalOffset: '41',
        originalKey: 'portfolio-alpha',
        originalValue: Buffer.from('payload'),
        attempts: 5,
        failureClass: 'Error',
        errorMessage: 'poison message',
        correlationId: 'workflow-1',
        causationId: 'fill-event-1',
      }),
    );
    expect(metrics.recordDeadLetter).toHaveBeenCalledWith({
      topic: KAFKA_TOPICS.ORDERS_FILLS,
      consumerGroup: 'portfolio-manager-order-fills',
      dlqTopic: KAFKA_TOPICS.ORDERS_FILLS_DLQ,
    });
  });

  it('recovers from transient handler failures before DLQ', async () => {
    const handle = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient db failure'))
      .mockRejectedValueOnce(new Error('transient db failure'))
      .mockResolvedValue(undefined);

    await createConsumer(handle).handleMessage(message);

    expect(handle).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([250, 500]);
    expect(dlqProducer.send).not.toHaveBeenCalled();
    expect(commitOffset).toHaveBeenCalledWith({
      topic: KAFKA_TOPICS.ORDERS_FILLS,
      partition: 1,
      offset: '42',
    });
    expect(metrics.recordConsumerMessage).toHaveBeenCalledWith(
      {
        topic: KAFKA_TOPICS.ORDERS_FILLS,
        consumerGroup: 'portfolio-manager-order-fills',
      },
      'success',
      expect.any(Number),
    );
  });

  it('does not commit when DLQ publishing fails', async () => {
    const handle = jest.fn().mockRejectedValue(new Error('poison message'));
    dlqProducer.send.mockRejectedValue(new Error('dlq unavailable'));

    await expect(createConsumer(handle).handleMessage(message)).rejects.toThrow(
      'dlq unavailable',
    );

    expect(commitOffset).not.toHaveBeenCalled();
  });

  it('does not let error message serialization crash retry and DLQ handling', async () => {
    const handle = jest.fn().mockRejectedValue(1n);

    await createConsumer(handle).handleMessage(message);

    const dlqSend = dlqProducer.send.mock.calls[0]?.[0];
    const dlqMessage = dlqSend?.messages[0];

    if (!dlqMessage) {
      throw new Error('Expected a DLQ message to be published');
    }

    const deadLetter = DeadLetterEvent.decode(dlqMessage.value);

    expect(deadLetter).toEqual(
      expect.objectContaining({
        failureClass: 'bigint',
        errorMessage: '1',
      }),
    );
    expect(commitOffset).toHaveBeenCalledWith({
      topic: KAFKA_TOPICS.ORDERS_FILLS,
      partition: 1,
      offset: '42',
    });
  });

  it('uses a terminal fallback when error string conversion also fails', async () => {
    const unsafeError = {
      toJSON() {
        throw new Error('json failed');
      },
      [Symbol.toPrimitive]() {
        throw new Error('string failed');
      },
    };
    const handle = jest.fn().mockRejectedValue(unsafeError);

    await createConsumer(handle).handleMessage(message);

    const dlqSend = dlqProducer.send.mock.calls[0]?.[0];
    const dlqMessage = dlqSend?.messages[0];

    if (!dlqMessage) {
      throw new Error('Expected a DLQ message to be published');
    }

    const deadLetter = DeadLetterEvent.decode(dlqMessage.value);

    expect(deadLetter.errorMessage).toBe('[unserializable error]');
    expect(commitOffset).toHaveBeenCalledWith({
      topic: KAFKA_TOPICS.ORDERS_FILLS,
      partition: 1,
      offset: '42',
    });
  });
});
