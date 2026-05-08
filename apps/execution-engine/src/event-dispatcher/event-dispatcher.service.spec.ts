import { KAFKA_TOPICS } from '@trading-bot/common';

import { EventDispatcherService } from './event-dispatcher.service';

describe('EventDispatcherService', () => {
  let outboxRepository: {
    enqueue: jest.Mock;
    claimBatch: jest.Mock;
    markDispatched: jest.Mock;
    markFailed: jest.Mock;
    getBacklogMetrics: jest.Mock;
  };
  let kafkaClient: {
    connect: jest.MockedFunction<() => Promise<void>>;
    close: jest.MockedFunction<() => Promise<void>>;
    emit: jest.Mock;
  };
  let service: EventDispatcherService;
  let metrics: {
    recordOutboxDispatch: jest.Mock;
    setOutboxBacklog: jest.Mock;
    setOutboxBacklogSnapshot: jest.Mock;
    setOldestOutboxAgeSeconds: jest.Mock;
  };

  beforeEach(() => {
    outboxRepository = {
      enqueue: jest.fn(),
      claimBatch: jest.fn(),
      markDispatched: jest.fn(),
      markFailed: jest.fn(),
      getBacklogMetrics: jest.fn().mockResolvedValue({
        rows: [],
        oldestPendingAt: null,
      }),
    };
    kafkaClient = {
      connect: jest.fn(),
      close: jest.fn(),
      emit: jest.fn(),
    };
    metrics = {
      recordOutboxDispatch: jest.fn(),
      setOutboxBacklog: jest.fn(),
      setOutboxBacklogSnapshot: jest.fn(),
      setOldestOutboxAgeSeconds: jest.fn(),
    };
    service = new EventDispatcherService(
      outboxRepository as never,
      kafkaClient as never,
      { enableOutboxInterval: false, enableApprovedTradesConsumer: false },
      metrics as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('connects and closes the Kafka client', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(kafkaClient.connect).toHaveBeenCalledTimes(1);
    expect(kafkaClient.close).toHaveBeenCalledTimes(1);
  });

  it('starts the dispatcher interval when enabled', async () => {
    jest.useFakeTimers();
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
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
