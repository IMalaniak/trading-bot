import { Module } from '@nestjs/common';

import { EventDispatcherModule } from '../event-dispatcher/event-dispatcher.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PortfolioSignalCandidateEventFactory } from './events/portfolio-signal-candidate-event.factory';
import { TradeDecisionEventFactory } from './events/trade-decision-event.factory';
import { PortfolioTopicConsumer } from './portfolio-topic.consumer';
import { CandidateRepository } from './repositories/candidate.repository';
import { DecisionRepository } from './repositories/decision.repository';
import { ReservationRepository } from './repositories/reservation.repository';
import { RiskConfigRepository } from './repositories/risk-config.repository';
import { SignalReceiptRepository } from './repositories/signal-receipt.repository';
import { InstrumentStageService } from './services/instrument-stage.service';
import { PortfolioStageService } from './services/portfolio-stage.service';
import { RiskRuleEngine } from './services/risk-rule-engine.service';
import { TradeSizingService } from './services/trade-sizing.service';
import { SignalTopicConsumer } from './signal-topic.consumer';

@Module({
  imports: [PrismaModule, EventDispatcherModule],
  providers: [
    CandidateRepository,
    DecisionRepository,
    ReservationRepository,
    RiskConfigRepository,
    SignalReceiptRepository,
    InstrumentStageService,
    PortfolioStageService,
    PortfolioSignalCandidateEventFactory,
    TradeDecisionEventFactory,
    TradeSizingService,
    RiskRuleEngine,
    SignalTopicConsumer,
    PortfolioTopicConsumer,
  ],
})
export class RiskPipelineModule {}
