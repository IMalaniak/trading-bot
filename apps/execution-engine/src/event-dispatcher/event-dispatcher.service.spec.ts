import { KAFKA_TOPICS } from '@trading-bot/common';
import type { Mock, MockedFunction } from 'vitest';

import { EventDispatcherService } from './event-dispatcher.service';

describe('EventDispatcherService', () => {
  let outboxRepository: {
    enqueue: Mock;
    claimBatch: Mock;
    markDispatched: Mock;
    markFailed: Mock;
    getBacklogMetrics: Mock;
  };
  let kafkaClient: {
    connect: MockedFunction<() => Promise<void>>;
    close: MockedFunction<() => Promise<void>>;
    emit: Mock;
  };
  let service: EventDispatcherService;
  let metrics: {
    recordOutboxDispatch: Mock;
    setOutboxBacklog: Mock;
    setOutboxBacklogSnapshot: Mock;
    setOldestOutboxAgeSeconds: Mock;
  };

  beforeEach(() => {
    outboxRepository = {
      enqueue: vi.fn(),
      claimBatch: vi.fn(),
      markDispatched: vi.fn(),
      markFailed: vi.fn(),
      getBacklogMetrics: vi.fn().mockResolvedValue({
        rows: [],
        oldestPendingAt: null,
      }),
    };
    kafkaClient = {
      connect: vi.fn(),
      close: vi.fn(),
      emit: vi.fn(),
    };
    metrics = {
      recordOutboxDispatch: vi.fn(),
      setOutboxBacklog: vi.fn(),
      setOutboxBacklogSnapshot: vi.fn(),
      setOldestOutboxAgeSeconds: vi.fn(),
    };
    service = new EventDispatcherService(
      outboxRepository as never,
      kafkaClient as never,
      { enableOutboxInterval: false, enableApprovedTradesConsumer: false },
      metrics as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects and closes the Kafka client', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(kafkaClient.connect).toHaveBeenCalledTimes(1);
    expect(kafkaClient.close).toHaveBeenCalledTimes(1);
  });

  it('starts the dispatcher interval when enabled', async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    service = new EventDispatcherService(
      outboxRepository as never,
      kafkaClient as never,
      { enableOutboxInterval: true, enableApprovedTradesConsumer: false },
      metrics as never,
    );

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    setIntervalSpy.mockRestore();
  });

  it('delegates enqueueing with lifecycle sequence to the execution outbox repository', async () => {
    const tx = {};
    const message = {
      eventId: 'event-1',
      key: 'portfolio-1',
      value: new Uint8Array([1]),
    };
    outboxRepository.enqueue.mockResolvedValue('event-1');

    await expect(
      service.enqueueEvent(tx as never, 'orders.fills', 2, message),
    ).resolves.toBe('event-1');

    expect(outboxRepository.enqueue).toHaveBeenCalledWith(
      tx,
      'orders.fills',
      2,
      message,
    );
  });

  it('uses the shared outbox dispatcher for batch dispatch', async () => {
    outboxRepository.claimBatch.mockResolvedValue([]);

    await service.dispatchOutboxBatch();

    expect(outboxRepository.claimBatch).toHaveBeenCalledWith({
      batchSize: 50,
      staleInFlightTimeoutMs: 30000,
    });
    expect(metrics.setOutboxBacklogSnapshot).toHaveBeenCalledWith([]);
    expect(metrics.setOldestOutboxAgeSeconds).toHaveBeenCalledWith(0);
  });

  it('publishes outbox backlog metrics as a snapshot', async () => {
    outboxRepository.claimBatch.mockResolvedValue([]);
    outboxRepository.getBacklogMetrics.mockResolvedValue({
      rows: [{ topic: KAFKA_TOPICS.ORDERS_FILLS, status: 'PENDING', count: 2 }],
      oldestPendingAt: null,
    });

    await service.dispatchOutboxBatch();

    expect(metrics.setOutboxBacklogSnapshot).toHaveBeenCalledWith([
      {
        topic: KAFKA_TOPICS.ORDERS_FILLS,
        status: 'PENDING',
        value: 2,
      },
    ]);
  });
});
