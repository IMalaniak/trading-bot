import { Module } from '@nestjs/common';

import { EventDispatcherModule } from '../event-dispatcher/event-dispatcher.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InstrumentRegisteredEventFactory } from './events/instrument-registered-event.factory';
import { InstrumentMapper } from './mapper/instrument.mapper';
import { PortfolioReadMapper } from './mapper/portfolio-read.mapper';
import { PortfolioController } from './portfolio.controller';
import { PortfolioQueryRepository } from './repositories/portfolio-query.repository';
import { PortfolioWriteRepository } from './repositories/portfolio-write.repository';
import { AssignStrategyToPortfolioService } from './services/assign-strategy-to-portfolio.service';
import { CreateStrategyService } from './services/create-strategy.service';
import { GetStrategyService } from './services/get-strategy.service';
import { ListRiskConfigAuditLogService } from './services/list-risk-config-audit-log.service';
import { ListRiskDecisionsService } from './services/list-risk-decisions.service';
import { ListStrategiesService } from './services/list-strategies.service';
import { PortfolioService } from './services/portfolio.service';
import { PortfolioQueryService } from './services/portfolio-query.service';
import { UpdatePortfolioService } from './services/update-portfolio.service';
import { UpdatePortfolioInstrumentConfigService } from './services/update-portfolio-instrument-config.service';
import { UpdateStrategyService } from './services/update-strategy.service';

@Module({
  imports: [PrismaModule, EventDispatcherModule],
  controllers: [PortfolioController],
  providers: [
    PortfolioService,
    PortfolioQueryService,
    PortfolioQueryRepository,
    PortfolioWriteRepository,
    UpdatePortfolioInstrumentConfigService,
    UpdatePortfolioService,
    ListRiskDecisionsService,
    ListRiskConfigAuditLogService,
    CreateStrategyService,
    UpdateStrategyService,
    GetStrategyService,
    ListStrategiesService,
    AssignStrategyToPortfolioService,
    InstrumentMapper,
    PortfolioReadMapper,
    InstrumentRegisteredEventFactory,
  ],
})
export class PortfolioModule {}
