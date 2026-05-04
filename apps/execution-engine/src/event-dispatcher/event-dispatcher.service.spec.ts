import { EventDispatcherService } from './event-dispatcher.service';

describe('EventDispatcherService', () => {
  let outboxRepository: {
    enqueue: jest.Mock;
    claimBatch: jest.Mock;
    markDispatched: jest.Mock;
    markFailed: jest.Mock;
  };
  let kafkaClient: {
    connect: jest.MockedFunction<() => Promise<void>>;
    close: jest.MockedFunction<() => Promise<void>>;
    emit: jest.Mock;
  };
  let service: EventDispatcherService;

  beforeEach(() => {
    outboxRepository = {
      enqueue: jest.fn(),
      claimBatch: jest.fn(),
      markDispatched: jest.fn(),
      markFailed: jest.fn(),
    };
    kafkaClient = {
      connect: jest.fn(),
      close: jest.fn(),
      emit: jest.fn(),
    };
    service = new EventDispatcherService(
      outboxRepository as never,
      kafkaClient as never,
      { enableOutboxInterval: false, enableApprovedTradesConsumer: false },
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
  });
});
