import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, SignalSide } from '@trading-bot/common/proto';

import { AppModule } from '../app/app.module';
import { executionEngineRuntimeConfig } from '../config/runtime.config';
import { ExecutionOrderStatus } from '../prisma/generated/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionQueryService } from './services/execution-query.service';

describe('Execution read integration', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let executionQueryService: ExecutionQueryService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(executionEngineRuntimeConfig.KEY)
      .useValue({
        enableOutboxInterval: false,
        enableApprovedTradesConsumer: false,
      })
      .compile();

    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    executionQueryService = moduleRef.get(ExecutionQueryService);
  });

  beforeEach(async () => {
    await prisma.executionFill.deleteMany();
    await prisma.executionOrder.deleteMany();
    await prisma.outboxEvent.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await moduleRef.close();
  });

  it('returns recent execution orders with nested fills', async () => {
    await prisma.executionOrder.create({
      data: {
        id: 'ord_abc',
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
        status: ExecutionOrderStatus.FILLED,
        approvedAt: new Date('2026-03-25T12:00:02.000Z'),
        placedAt: new Date('2026-03-25T12:00:03.000Z'),
        lastActivityAt: new Date('2026-03-25T12:00:05.000Z'),
      },
    });
    await prisma.executionFill.create({
      data: {
        id: 'ord_abc:fill:2',
        orderId: 'ord_abc',
        portfolioId: 'portfolio-alpha',
        instrumentId: 'instrument-1',
        sequence: 2,
        fillNotional: '50',
        fillQuantity: '0.5',
        fillPrice: '100',
        cumulativeFilledNotional: '100',
        cumulativeFilledQuantity: '1',
        orderStatus: ExecutionOrderStatus.FILLED,
        filledAt: new Date('2026-03-25T12:00:05.000Z'),
      },
    });

    await expect(
      executionQueryService.listPortfolioExecutionOrders('portfolio-alpha', 20),
    ).resolves.toEqual({
      orders: [
        expect.objectContaining({
          orderId: 'ord_abc',
          requestedNotional: '100',
          status: OrderStatus.FILLED,
          fills: [
            expect.objectContaining({
              fillId: 'ord_abc:fill:2',
              fillQuantity: '0.5',
              orderStatus: OrderStatus.FILLED,
            }),
          ],
        }),
      ],
    });
  });
});
