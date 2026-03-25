import { KAFKA_EVENT_HEADER_NAMES, KAFKA_TOPICS } from '@trading-bot/common';
import { of, throwError } from 'rxjs';

import { EventDispatcherService } from './event-dispatcher.service';

describe('EventDispatcherService', () => {
  let service: EventDispatcherService;
  let prisma: {
    $queryRaw: jest.Mock;
    outboxEvent: {
      update: jest.Mock;
    };
  };
  let kafka: {
    emit: jest.Mock;
    connect: jest.Mock;
    close: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      outboxEvent: {
        update: jest.fn(),
      },
    };
    kafka = {
      emit: jest.fn(),
      connect: jest.fn(),
      close: jest.fn(),
    };
    service = new EventDispatcherService(prisma as never, kafka as never);

    // spy on logger to avoid cluttering test output
    jest.spyOn(service['logger'], 'debug').mockImplementation(() => jest.fn());
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => jest.fn());
    jest.spyOn(service['logger'], 'error').mockImplementation(() => jest.fn());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('connects Kafka and starts dispatcher on module init', async () => {
    jest.useFakeTimers();
    const setIntervalSpy = jest.spyOn(global, 'setInterval');

    await service.onModuleInit();

    expect(kafka.connect).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    await service.onModuleDestroy();

    expect(kafka.close).toHaveBeenCalledTimes(1);

    setIntervalSpy.mockRestore();
  });

  it('enqueues outbox events in the same transaction', async () => {
    const tx = {
      outboxEvent: {
        create: jest.fn(),
      },
    };

    const eventId = await service.enqueueEvent(
      tx as never,
      KAFKA_TOPICS.INSTRUMENT_REGISTERED,
      {
        eventId: 'event-1',
        key: 'key-1',
        value: new Uint8Array([1, 2, 3]),
        headers: {
          [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: 'event-1',
          'content-type': 'application/x-protobuf',
        },
      },
    );

    expect(eventId).toBe('event-1');
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        id: 'event-1',
        topic: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
        key: 'key-1',
        value: Buffer.from([1, 2, 3]),
        headers: {
          [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: 'event-1',
          'content-type': 'application/x-protobuf',
        },
        status: 'PENDING',
      },
    });
  });

  it('falls back to the header event id when one is already present', async () => {
    const tx = {
      outboxEvent: {
        create: jest.fn(),
      },
    };

    const eventId = await service.enqueueEvent(
      tx as never,
      KAFKA_TOPICS.INSTRUMENT_REGISTERED,
      {
        key: 'key-1',
        value: new Uint8Array([1, 2, 3]),
        headers: {
          [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: 'event-2',
        },
      },
    );

    expect(eventId).toBe('event-2');
  });

  it('backfills the event-id header when generating a new outbox id', async () => {
    const tx = {
      outboxEvent: {
        create: jest.fn(),
      },
    };

    const eventId = await service.enqueueEvent(
      tx as never,
      KAFKA_TOPICS.INSTRUMENT_REGISTERED,
      {
        key: 'key-1',
        value: new Uint8Array([1, 2, 3]),
        headers: {
          [KAFKA_EVENT_HEADER_NAMES.CONTENT_TYPE]: 'application/x-protobuf',
        },
      },
    );

    expect(eventId).toEqual(expect.any(String));
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        id: eventId,
        topic: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
        key: 'key-1',
        value: Buffer.from([1, 2, 3]),
        headers: {
          [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: eventId,
          [KAFKA_EVENT_HEADER_NAMES.CONTENT_TYPE]: 'application/x-protobuf',
        },
        status: 'PENDING',
      },
    });
  });

  it('dispatches claimed events and marks them as dispatched', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'event-1',
        topic: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
        key: 'key-1',
        value: new Uint8Array([1, 2, 3]),
        headers: { 'content-type': 'application/x-protobuf' },
        attempts: 0,
      },
    ]);
    prisma.outboxEvent.update.mockResolvedValue(undefined);
    kafka.emit.mockReturnValue(of(undefined));

    await service.dispatchOutboxBatch();

    expect(kafka.emit).toHaveBeenCalledWith(
      KAFKA_TOPICS.INSTRUMENT_REGISTERED,
      {
        key: 'key-1',
        value: Buffer.from([1, 2, 3]),
        headers: { 'content-type': 'application/x-protobuf' },
      },
    );
    expect(prisma.outboxEvent.update).toHaveBeenCalledTimes(1);
  });

  it('marks failed events when dispatch errors', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'event-1',
        topic: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
        key: 'key-1',
        value: new Uint8Array([1, 2, 3]),
        headers: null,
        attempts: 1,
      },
    ]);
    prisma.outboxEvent.update.mockResolvedValue(undefined);
    kafka.emit.mockReturnValue(throwError(() => new Error('boom')));

    await service.dispatchOutboxBatch();

    expect(kafka.emit).toHaveBeenCalledWith(
      KAFKA_TOPICS.INSTRUMENT_REGISTERED,
      {
        key: 'key-1',
        value: Buffer.from([1, 2, 3]),
        headers: undefined,
      },
    );
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        attempts: 2,
        lastError: 'boom',
        nextAttemptAt: expect.any(Date) as Date,
      }) as unknown,
    });
  });
});
