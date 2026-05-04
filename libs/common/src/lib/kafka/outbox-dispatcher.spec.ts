import { of, throwError } from 'rxjs';

import type { OutboxDispatcherRepository } from './outbox-dispatcher';
import type { OutboxKafkaEmitter } from './outbox-dispatcher';
import { KafkaOutboxDispatcher } from './outbox-dispatcher';

describe('KafkaOutboxDispatcher', () => {
  let repository: jest.Mocked<OutboxDispatcherRepository>;
  let kafkaEmitter: { emit: jest.MockedFunction<OutboxKafkaEmitter['emit']> };
  let logger: {
    debug: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };

  const createDispatcher = () =>
    new KafkaOutboxDispatcher({
      repository,
      kafkaEmitter,
      logger,
      options: {
        emitRetryBaseMs: 0,
        now: () => new Date('2026-03-25T12:00:00.000Z'),
        sleep: async () => Promise.resolve(),
      },
    });

  beforeEach(() => {
    repository = {
      claimBatch: jest.fn(),
      markDispatched: jest.fn(),
      markFailed: jest.fn(),
    };
    kafkaEmitter = {
      emit: jest.fn(),
    };
    logger = {
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  });

  it('dispatches claimed events in created/order sequence and marks success', async () => {
    const createdAt = new Date('2026-03-25T12:00:00.000Z');
    repository.claimBatch.mockResolvedValue([
      {
        id: 'fill-2',
        topic: 'orders.fills',
        key: 'portfolio-1',
        value: new Uint8Array([3]),
        attempts: 0,
        createdAt,
        dispatchOrder: 3,
      },
      {
        id: 'placed',
        topic: 'orders.placed',
        key: 'portfolio-1',
        value: new Uint8Array([1]),
        attempts: 0,
        createdAt,
        dispatchOrder: 1,
      },
      {
        id: 'fill-1',
        topic: 'orders.fills',
        key: 'portfolio-1',
        value: new Uint8Array([2]),
        attempts: 0,
        createdAt,
        dispatchOrder: 2,
      },
    ]);
    kafkaEmitter.emit.mockReturnValue(of(undefined));

    await createDispatcher().dispatchBatch();

    expect(kafkaEmitter.emit.mock.calls.map(([topic]) => topic)).toEqual([
      'orders.placed',
      'orders.fills',
      'orders.fills',
    ]);
    expect(repository.markDispatched.mock.calls).toHaveLength(3);
  });

  it('marks failed events with retry state after emit attempts are exhausted', async () => {
    repository.claimBatch.mockResolvedValue([
      {
        id: 'event-1',
        topic: 'orders.placed',
        key: 'portfolio-1',
        value: new Uint8Array([1]),
        attempts: 1,
      },
    ]);
    kafkaEmitter.emit.mockReturnValue(
      throwError(() => new Error('broker unavailable')),
    );

    await createDispatcher().dispatchBatch();

    expect(kafkaEmitter.emit).toHaveBeenCalledTimes(3);
    expect(repository.markFailed.mock.calls).toEqual([
      [
        {
          id: 'event-1',
          attempts: 2,
          nextAttemptAt: new Date('2026-03-25T12:00:00.800Z'),
          lastError: 'broker unavailable',
        },
      ],
    ]);
  });
});
