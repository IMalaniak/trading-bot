import { Module } from '@nestjs/common';

import { EventDispatcherModule } from '../event-dispatcher/event-dispatcher.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InstrumentRegisteredEventFactory } from './events/instrument-registered-event.factory';
import { InstrumentMapper } from './mapper/instrument.mapper';
import { PortfolioReadMapper } from './mapper/portfolio-read.mapper';
import { PortfolioController } from './portfolio.controller';
import { PortfolioQueryRepository } from './repositories/portfolio-query.repository';
import { PortfolioWriteRepository } from './repositories/portfolio-write.repository';
import { ListRiskConfigAuditLogService } from './services/list-risk-config-audit-log.service';
import { ListRiskDecisionsService } from './services/list-risk-decisions.service';
import { PortfolioService } from './services/portfolio.service';
import { PortfolioQueryService } from './services/portfolio-query.service';
import { UpdatePortfolioService } from './services/update-portfolio.service';
import { UpdatePortfolioInstrumentConfigService } from './services/update-portfolio-instrument-config.service';

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
    InstrumentMapper,
    PortfolioReadMapper,
    InstrumentRegisteredEventFactory,
  ],
})
export class PortfolioModule {}
