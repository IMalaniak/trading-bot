import { KAFKA_TOPICS } from '@trading-bot/common';
import type { Mock } from 'vitest';

import { portfolioManagerRuntimeConfig } from '../config/runtime.config';
import { EventDispatcherService } from './event-dispatcher.service';

describe('EventDispatcherService', () => {
  let service: EventDispatcherService;
  let outboxRepository: {
    enqueue: Mock;
    claimBatch: Mock;
    markDispatched: Mock;
    markFailed: Mock;
    getBacklogMetrics: Mock;
  };
  let kafka: {
    emit: Mock;
    connect: Mock;
    close: Mock;
  };
  let runtimeConfig: ReturnType<typeof portfolioManagerRuntimeConfig>;
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
    kafka = {
      emit: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(),
    };
    runtimeConfig = portfolioManagerRuntimeConfig();
    metrics = {
      recordOutboxDispatch: vi.fn(),
      setOutboxBacklog: vi.fn(),
      setOutboxBacklogSnapshot: vi.fn(),
      setOldestOutboxAgeSeconds: vi.fn(),
    };
    service = new EventDispatcherService(
      outboxRepository as never,
      kafka as never,
      runtimeConfig,
      metrics as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects Kafka and starts dispatcher on module init when enabled', async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(global, 'setInterval');

    await service.onModuleInit();

    expect(kafka.connect).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    await service.onModuleDestroy();

    expect(kafka.close).toHaveBeenCalledTimes(1);

    setIntervalSpy.mockRestore();
  });

  it('does not start the dispatcher interval when runtime config disables it', async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    runtimeConfig.enableOutboxInterval = false;
    service = new EventDispatcherService(
      outboxRepository as never,
      kafka as never,
      runtimeConfig,
      metrics as never,
    );

    await service.onModuleInit();

    expect(kafka.connect).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).not.toHaveBeenCalled();

    await service.onModuleDestroy();

    setIntervalSpy.mockRestore();
  });

  it('delegates enqueueing to the portfolio outbox repository', async () => {
    const tx = {};
    const message = {
      eventId: 'event-1',
      key: 'key-1',
      value: new Uint8Array([1, 2, 3]),
    };
    outboxRepository.enqueue.mockResolvedValue('event-1');

    const eventId = await service.enqueueEvent(
      tx as never,
      KAFKA_TOPICS.INSTRUMENT_REGISTERED,
      message,
    );

    expect(eventId).toBe('event-1');
    expect(outboxRepository.enqueue).toHaveBeenCalledWith(
      tx,
      KAFKA_TOPICS.INSTRUMENT_REGISTERED,
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
      rows: [
        { topic: KAFKA_TOPICS.PORTFOLIO_UPDATED, status: 'PENDING', count: 2 },
      ],
      oldestPendingAt: null,
    });

    await service.dispatchOutboxBatch();

    expect(metrics.setOutboxBacklogSnapshot).toHaveBeenCalledWith([
      {
        topic: KAFKA_TOPICS.PORTFOLIO_UPDATED,
        status: 'PENDING',
        value: 2,
      },
    ]);
  });
});
