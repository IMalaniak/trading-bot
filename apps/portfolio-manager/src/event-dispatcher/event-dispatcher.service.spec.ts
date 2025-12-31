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

    await service.enqueueEvent(tx as never, 'topic', {
      key: 'key-1',
      value: new Uint8Array([1, 2, 3]),
      headers: { 'content-type': 'application/x-protobuf' },
    });

    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('dispatches claimed events and marks them as dispatched', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'event-1',
        topic: 'portfolio.instrument.created',
        key: 'key-1',
        value: Buffer.from([1, 2, 3]),
        headers: { 'content-type': 'application/x-protobuf' },
        attempts: 0,
      },
    ]);
    prisma.outboxEvent.update.mockResolvedValue(undefined);
    kafka.emit.mockReturnValue(of(undefined));

    await service.dispatchOutboxBatch();

    expect(kafka.emit).toHaveBeenCalledWith('portfolio.instrument.created', {
      key: 'key-1',
      value: Buffer.from([1, 2, 3]),
      headers: { 'content-type': 'application/x-protobuf' },
    });
    expect(prisma.outboxEvent.update).toHaveBeenCalledTimes(1);
  });

  it('marks failed events when dispatch errors', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'event-1',
        topic: 'portfolio.instrument.created',
        key: 'key-1',
        value: Buffer.from([1, 2, 3]),
        headers: null,
        attempts: 1,
      },
    ]);
    prisma.outboxEvent.update.mockResolvedValue(undefined);
    kafka.emit.mockReturnValue(throwError(() => new Error('boom')));

    await service.dispatchOutboxBatch();

    expect(kafka.emit).toHaveBeenCalledWith('portfolio.instrument.created', {
      key: 'key-1',
      value: Buffer.from([1, 2, 3]),
      headers: undefined,
    });
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
