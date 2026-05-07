import { Module } from '@nestjs/common';

import { EventDispatcherModule } from '../event-dispatcher/event-dispatcher.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ApprovedTradesConsumer } from './approved-trades.consumer';
import { OrderLifecycleEventFactory } from './events/order-lifecycle-event.factory';
import { ExecutionReadController } from './execution-read.controller';
import { ExecutionReadMapper } from './mapper/execution-read.mapper';
import { ExecutionQueryRepository } from './repositories/execution-query.repository';
import { ExecutionOrderService } from './services/execution-order.service';
import { ExecutionQueryService } from './services/execution-query.service';
import { ExecutionSimulatorService } from './services/execution-simulator.service';

@Module({
  imports: [PrismaModule, EventDispatcherModule],
  controllers: [ExecutionReadController],
  providers: [
    ApprovedTradesConsumer,
    ExecutionOrderService,
    ExecutionQueryService,
    ExecutionQueryRepository,
    ExecutionReadMapper,
    ExecutionSimulatorService,
    OrderLifecycleEventFactory,
  ],
})
export class ExecutionModule {}
