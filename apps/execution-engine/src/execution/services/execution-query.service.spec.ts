import { OrderStatus, SignalSide } from '@trading-bot/common/proto';
import type { MockedFunction } from 'vitest';

import { ExecutionOrderStatus } from '../../prisma/generated/enums';
import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { ExecutionReadMapper } from '../mapper/execution-read.mapper';
import { ExecutionQueryRepository } from '../repositories/execution-query.repository';
import { ExecutionQueryService } from './execution-query.service';

describe('ExecutionQueryService', () => {
  let repository: {
    listPortfolioOrders: MockedFunction<
      ExecutionQueryRepository['listPortfolioOrders']
    >;
  };
  let service: ExecutionQueryService;

  beforeEach(() => {
    repository = {
      listPortfolioOrders: vi.fn(),
    };
    service = new ExecutionQueryService(
      repository as unknown as ExecutionQueryRepository,
      new ExecutionReadMapper(),
    );
  });

  it('returns recent orders with nested fills and decimal strings', async () => {
    const approvedAt = new Date('2026-03-25T12:00:02.000Z');
    const placedAt = new Date('2026-03-25T12:00:03.000Z');
    const filledAt = new Date('2026-03-25T12:00:05.000Z');
    repository.listPortfolioOrders.mockResolvedValue([
      {
        id: 'ord_abc',
        approvalEventId: 'approval-event-1',
        candidateIdempotencyKey: 'source-event-1:portfolio-alpha',
        sourceEventId: 'source-event-1',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        signalId: 'signal-1',
        side: SignalSide.BUY,
        requestedNotional: toPrismaDecimal('100'),
        requestedQuantity: toPrismaDecimal('1'),
        referencePrice: toPrismaDecimal('100'),
        status: ExecutionOrderStatus.FILLED,
        approvedAt,
        placedAt,
        lastActivityAt: filledAt,
        createdAt: placedAt,
        updatedAt: filledAt,
        fills: [
          {
            id: 'ord_abc:fill:2',
            orderId: 'ord_abc',
            portfolioId: 'portfolio-alpha',
            instrumentId: 'instrument-1',
            sequence: 2,
            fillNotional: toPrismaDecimal('50'),
            fillQuantity: toPrismaDecimal('0.5'),
            fillPrice: toPrismaDecimal('100'),
            cumulativeFilledNotional: toPrismaDecimal('100'),
            cumulativeFilledQuantity: toPrismaDecimal('1'),
            orderStatus: ExecutionOrderStatus.FILLED,
            filledAt,
            createdAt: filledAt,
            updatedAt: filledAt,
          },
        ],
      },
    ]);

    await expect(
      service.listPortfolioExecutionOrders('portfolio-alpha', 10),
    ).resolves.toEqual({
      orders: [
        {
          orderId: 'ord_abc',
          approvalEventId: 'approval-event-1',
          candidateIdempotencyKey: 'source-event-1:portfolio-alpha',
          sourceEventId: 'source-event-1',
          portfolioId: 'portfolio-alpha',
          instrumentId: 'instrument-1',
          signalId: 'signal-1',
          side: SignalSide.BUY,
          requestedNotional: '100',
          requestedQuantity: '1',
          referencePrice: '100',
          status: OrderStatus.FILLED,
          approvedAt: '2026-03-25T12:00:02.000Z',
          placedAt: '2026-03-25T12:00:03.000Z',
          lastActivityAt: '2026-03-25T12:00:05.000Z',
          fills: [
            {
              fillId: 'ord_abc:fill:2',
              orderId: 'ord_abc',
              portfolioId: 'portfolio-alpha',
              instrumentId: 'instrument-1',
              sequence: 2,
              fillNotional: '50',
              fillQuantity: '0.5',
              fillPrice: '100',
              cumulativeFilledNotional: '100',
              cumulativeFilledQuantity: '1',
              orderStatus: OrderStatus.FILLED,
              filledAt: '2026-03-25T12:00:05.000Z',
            },
          ],
        },
      ],
    });
  });

  it('uses the caller-provided portfolio id and normalized limit', async () => {
    repository.listPortfolioOrders.mockResolvedValue([]);

    await service.listPortfolioExecutionOrders('portfolio-alpha', 20);

    expect(repository.listPortfolioOrders).toHaveBeenCalledWith(
      'portfolio-alpha',
      20,
    );
  });
});
