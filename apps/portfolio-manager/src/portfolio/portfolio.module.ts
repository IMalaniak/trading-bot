import { Module } from '@nestjs/common';

import { EventDispatcherModule } from '../event-dispatcher/event-dispatcher.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InstrumentRegisteredEventFactory } from './events/instrument-registered-event.factory';
import { InstrumentMapper } from './mapper/instrument.mapper';
import { PortfolioReadMapper } from './mapper/portfolio-read.mapper';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { PortfolioQueryRepository } from './repositories/portfolio-query.repository';
import { PortfolioQueryService } from './services/portfolio-query.service';

@Module({
  imports: [PrismaModule, EventDispatcherModule],
  controllers: [PortfolioController],
  providers: [
    PortfolioService,
    PortfolioQueryService,
    PortfolioQueryRepository,
    InstrumentMapper,
    PortfolioReadMapper,
    InstrumentRegisteredEventFactory,
  ],
})
export class PortfolioModule {}
