import { Module } from '@nestjs/common';

import { EventDispatcherModule } from '../event-dispatcher/event-dispatcher.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PortfolioUpdatedEventFactory } from './events/portfolio-updated-event.factory';
import { OrderFillsConsumer } from './order-fills.consumer';
import { PortfolioReconciliationRepository } from './repositories/portfolio-reconciliation.repository';
import { FillReconciliationService } from './services/fill-reconciliation.service';
import { PositionAccountingService } from './services/position-accounting.service';

@Module({
  imports: [PrismaModule, EventDispatcherModule],
  providers: [
    PortfolioReconciliationRepository,
    PositionAccountingService,
    PortfolioUpdatedEventFactory,
    FillReconciliationService,
    OrderFillsConsumer,
  ],
})
export class FillReconciliationModule {}
