import { Module } from '@nestjs/common';

import { EventDispatcherModule } from '../event-dispatcher/event-dispatcher.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ApprovedTradesConsumer } from './approved-trades.consumer';
import { OrderLifecycleEventFactory } from './events/order-lifecycle-event.factory';
import { ExecutionOrderService } from './services/execution-order.service';
import { ExecutionSimulatorService } from './services/execution-simulator.service';

@Module({
  imports: [PrismaModule, EventDispatcherModule],
  providers: [
    ApprovedTradesConsumer,
    ExecutionOrderService,
    ExecutionSimulatorService,
    OrderLifecycleEventFactory,
  ],
})
export class ExecutionModule {}
