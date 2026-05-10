import { KAFKA_EVENT_HEADER_NAMES } from '@trading-bot/common';
import type { Mock } from 'vitest';

import { OutboxEventStatus } from '../prisma/generated/client';
import { OutboxRepository } from './outbox.repository';

describe('OutboxRepository', () => {
  let prisma: {
    $queryRaw: Mock;
    outboxEvent: {
      update: Mock;
    };
  };
  let repository: OutboxRepository;

  beforeEach(() => {
    prisma = {
      $queryRaw: vi.fn(),
      outboxEvent: {
        update: vi.fn(),
      },
    };
    repository = new OutboxRepository(prisma as never);
  });

  it('stores outbox events with stable event id headers and lifecycle sequence', async () => {
    const tx = {
      outboxEvent: {
        create: vi.fn(),
      },
    };

    await expect(
      repository.enqueue(tx as never, 'orders.fills', 2, {
        eventId: 'event-1',
        key: 'portfolio-1',
        value: new Uint8Array([1]),
        headers: {
          [KAFKA_EVENT_HEADER_NAMES.EVENT_TYPE]: 'orders.fills',
        },
      }),
    ).resolves.toBe('event-1');

    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        id: 'event-1',
        topic: 'orders.fills',
        key: 'portfolio-1',
        value: Buffer.from([1]),
        headers: {
          [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: 'event-1',
          [KAFKA_EVENT_HEADER_NAMES.EVENT_TYPE]: 'orders.fills',
        },
        lifecycleSequence: 2,
        status: OutboxEventStatus.PENDING,
      },
    });
  });

  it('falls back to an existing event-id header', async () => {
    const tx = {
      outboxEvent: {
        create: vi.fn(),
      },
    };

    await expect(
      repository.enqueue(tx as never, 'orders.placed', 1, {
        key: 'portfolio-1',
        value: new Uint8Array([1]),
        headers: {
          [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: 'event-2',
        },
      }),
    ).resolves.toBe('event-2');

    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'event-2',
          lifecycleSequence: 1,
          headers: expect.objectContaining({
            [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: 'event-2',
          }) as Record<string, string>,
        }) as Record<string, unknown>,
      }),
    );
  });

  it('maps lifecycle sequence to shared dispatcher order', async () => {
    const createdAt = new Date('2026-03-25T12:00:00.000Z');
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'fill-1',
        topic: 'orders.fills',
        key: 'portfolio-1',
        value: Buffer.from([2]),
        headers: {},
        lifecycleSequence: 2,
        attempts: 0,
        createdAt,
      },
    ]);

    await expect(
      repository.claimBatch({
        batchSize: 50,
        staleInFlightTimeoutMs: 30000,
      }),
    ).resolves.toEqual([
      {
        id: 'fill-1',
        topic: 'orders.fills',
        key: 'portfolio-1',
        value: Buffer.from([2]),
        headers: {},
        attempts: 0,
        createdAt,
        dispatchOrder: 2,
      },
    ]);
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
