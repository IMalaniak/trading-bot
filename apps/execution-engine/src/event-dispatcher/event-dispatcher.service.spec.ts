import { KAFKA_EVENT_HEADER_NAMES } from '@trading-bot/common';
import { of, throwError } from 'rxjs';

import { EventDispatcherService } from './event-dispatcher.service';

describe('EventDispatcherService', () => {
  let prisma: {
    $queryRaw: jest.MockedFunction<() => Promise<unknown[]>>;
    outboxEvent: {
      create: jest.MockedFunction<() => Promise<undefined>>;
      update: jest.MockedFunction<() => Promise<undefined>>;
    };
  };
  let kafkaClient: {
    connect: jest.MockedFunction<() => Promise<void>>;
    close: jest.MockedFunction<() => Promise<void>>;
    emit: jest.MockedFunction<(topic: string, ...args: unknown[]) => unknown>;
  };
  let service: EventDispatcherService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      outboxEvent: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    kafkaClient = {
      connect: jest.fn(),
      close: jest.fn(),
      emit: jest.fn(),
    };
    service = new EventDispatcherService(
      prisma as never,
      kafkaClient as never,
      { enableOutboxInterval: false, enableApprovedTradesConsumer: false },
    );
  });

  it('stores outbox events with stable event id headers', async () => {
    prisma.outboxEvent.create.mockResolvedValue(undefined);

    await service.enqueueEvent(
      { outboxEvent: prisma.outboxEvent } as never,
      'topic',
      2,
      {
        eventId: 'event-1',
        key: 'portfolio-1',
        value: new Uint8Array([1]),
        headers: {
          [KAFKA_EVENT_HEADER_NAMES.EVENT_TYPE]: 'topic',
        },
      },
    );

    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'event-1',
        topic: 'topic',
        key: 'portfolio-1',
        lifecycleSequence: 2,
        headers: expect.objectContaining({
          [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: 'event-1',
        }),
      }),
    });
  });

  it('dispatches claimed events in lifecycle sequence order', async () => {
    const createdAt = new Date('2026-03-25T12:00:00.000Z');
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'fill-2',
        topic: 'orders.fills',
        key: 'portfolio-1',
        value: Buffer.from([3]),
        headers: {},
        lifecycleSequence: 3,
        attempts: 0,
        createdAt,
      },
      {
        id: 'placed',
        topic: 'orders.placed',
        key: 'portfolio-1',
        value: Buffer.from([1]),
        headers: {},
        lifecycleSequence: 1,
        attempts: 0,
        createdAt,
      },
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
    kafkaClient.emit.mockReturnValue(of(undefined));
    prisma.outboxEvent.update.mockResolvedValue(undefined);

    await service.dispatchOutboxBatch();

    expect(kafkaClient.emit.mock.calls.map((call) => call[0])).toEqual([
      'orders.placed',
      'orders.fills',
      'orders.fills',
    ]);
    expect(prisma.outboxEvent.update).toHaveBeenCalledTimes(3);
  });

  it('marks failed dispatches with retry state', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'placed',
        topic: 'orders.placed',
        key: 'portfolio-1',
        value: Buffer.from([1]),
        headers: {},
        lifecycleSequence: 1,
        attempts: 0,
        createdAt: new Date('2026-03-25T12:00:00.000Z'),
      },
    ]);
    kafkaClient.emit.mockReturnValue(
      throwError(() => new Error('broker unavailable')),
    );
    prisma.outboxEvent.update.mockResolvedValue(undefined);

    await service.dispatchOutboxBatch();

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'placed' },
      data: expect.objectContaining({
        attempts: 1,
        lastError: 'broker unavailable',
      }),
    });
  });
});
