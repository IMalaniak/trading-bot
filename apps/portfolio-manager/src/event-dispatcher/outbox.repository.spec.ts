import { KAFKA_EVENT_HEADER_NAMES, KAFKA_TOPICS } from '@trading-bot/common';

import { OutboxEventStatus } from '../prisma/generated/client';
import { OutboxRepository } from './outbox.repository';

describe('OutboxRepository', () => {
  let prisma: {
    $queryRaw: jest.Mock;
    outboxEvent: {
      update: jest.Mock;
    };
  };
  let repository: OutboxRepository;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      outboxEvent: {
        update: jest.fn(),
      },
    };
    repository = new OutboxRepository(prisma as never);
  });

  it('enqueues outbox events in the provided transaction', async () => {
    const tx = {
      outboxEvent: {
        create: jest.fn(),
      },
    };

    const eventId = await repository.enqueue(
      tx as never,
      KAFKA_TOPICS.INSTRUMENT_REGISTERED,
      {
        eventId: 'event-1',
        key: 'key-1',
        value: new Uint8Array([1, 2, 3]),
        headers: {
          [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: 'event-1',
          [KAFKA_EVENT_HEADER_NAMES.CONTENT_TYPE]: 'application/x-protobuf',
        },
      },
    );

    expect(eventId).toBe('event-1');
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        id: 'event-1',
        topic: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
        key: 'key-1',
        value: Buffer.from([1, 2, 3]),
        headers: {
          [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: 'event-1',
          [KAFKA_EVENT_HEADER_NAMES.CONTENT_TYPE]: 'application/x-protobuf',
        },
        status: OutboxEventStatus.PENDING,
      },
    });
  });

  it('falls back to an existing event-id header', async () => {
    const tx = {
      outboxEvent: {
        create: jest.fn(),
      },
    };

    const eventId = await repository.enqueue(
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
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'event-2',
          headers: expect.objectContaining({
            [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: 'event-2',
          }) as Record<string, string>,
        }) as Record<string, unknown>,
      }),
    );
  });

  it('backfills the event-id header when generating a new outbox id', async () => {
    const tx = {
      outboxEvent: {
        create: jest.fn(),
      },
    };

    const eventId = await repository.enqueue(
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
        status: OutboxEventStatus.PENDING,
      },
    });
  });

  it('claims dispatchable rows for the shared dispatcher', async () => {
    const rows = [
      {
        id: 'event-1',
        topic: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
        key: 'key-1',
        value: Buffer.from([1, 2, 3]),
        headers: null,
        attempts: 0,
        createdAt: new Date('2026-03-25T12:00:00.000Z'),
      },
    ];
    prisma.$queryRaw.mockResolvedValue(rows);

    await expect(
      repository.claimBatch({
        batchSize: 25,
        staleInFlightTimeoutMs: 15000,
      }),
    ).resolves.toBe(rows);
  });

  it('marks rows as dispatched or failed', async () => {
    const dispatchedAt = new Date('2026-03-25T12:00:00.000Z');

    await repository.markDispatched('event-1', dispatchedAt);
    await repository.markFailed({
      id: 'event-2',
      attempts: 3,
      nextAttemptAt: dispatchedAt,
      lastError: 'boom',
    });

    expect(prisma.outboxEvent.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'event-1' },
      data: {
        status: OutboxEventStatus.DISPATCHED,
        dispatchedAt,
        lastError: null,
      },
    });
    expect(prisma.outboxEvent.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'event-2' },
      data: {
        status: OutboxEventStatus.FAILED,
        attempts: 3,
        nextAttemptAt: dispatchedAt,
        lastError: 'boom',
      },
    });
  });
});
