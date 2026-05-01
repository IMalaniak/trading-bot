import { KAFKA_TOPICS } from '@trading-bot/common';
import {
  PortfolioSignalCandidate,
  Signal,
  SignalSide,
} from '@trading-bot/common/proto';

import { EventDispatcherService } from '../../event-dispatcher/event-dispatcher.service';
import {
  RiskDecisionReasonCode,
  RiskDecisionStatus,
} from '../../prisma/generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { TradeDecisionEventFactory } from '../events/trade-decision-event.factory';
import { CandidateRepository } from '../repositories/candidate.repository';
import { DecisionRepository } from '../repositories/decision.repository';
import { ReservationRepository } from '../repositories/reservation.repository';
import { RiskConfigRepository } from '../repositories/risk-config.repository';
import { PortfolioStageService } from './portfolio-stage.service';
import { RiskRuleEngine } from './risk-rule-engine.service';
import { TradeSizingService } from './trade-sizing.service';

type TransactionMethod = <T>(
  callback: (tx: object) => Promise<T>,
) => Promise<T>;
type MockCandidateRepository = {
  create: jest.MockedFunction<CandidateRepository['create']>;
  findByIdempotencyKey: jest.MockedFunction<
    CandidateRepository['findByIdempotencyKey']
  >;
  markDecided: jest.MockedFunction<CandidateRepository['markDecided']>;
};
type MockDecisionRepository = {
  findByCandidateIdempotencyKey: jest.MockedFunction<
    DecisionRepository['findByCandidateIdempotencyKey']
  >;
  create: jest.MockedFunction<DecisionRepository['create']>;
};
type MockReservationRepository = {
  sumActivePortfolioReservedNotional: jest.MockedFunction<
    ReservationRepository['sumActivePortfolioReservedNotional']
  >;
  sumActiveInstrumentReservedNotional: jest.MockedFunction<
    ReservationRepository['sumActiveInstrumentReservedNotional']
  >;
  create: jest.MockedFunction<ReservationRepository['create']>;
};
type MockRiskConfigRepository = {
  instrumentExists: jest.MockedFunction<
    RiskConfigRepository['instrumentExists']
  >;
  findConfigsByInstrumentId: jest.MockedFunction<
    RiskConfigRepository['findConfigsByInstrumentId']
  >;
  findConfig: jest.MockedFunction<RiskConfigRepository['findConfig']>;
};
type MockTradeSizingService = {
  sizeTrade: jest.MockedFunction<TradeSizingService['sizeTrade']>;
};
type MockRiskRuleEngine = {
  evaluate: jest.MockedFunction<RiskRuleEngine['evaluate']>;
};
type MockTradeDecisionEventFactory = {
  create: jest.MockedFunction<TradeDecisionEventFactory['create']>;
};
type MockEventDispatcher = {
  enqueueEvent: jest.MockedFunction<EventDispatcherService['enqueueEvent']>;
};

describe('PortfolioStageService', () => {
  let service: PortfolioStageService;
  let prisma: { $transaction: TransactionMethod };
  let transactionMock: jest.MockedFunction<
    (callback: (tx: object) => Promise<unknown>) => Promise<unknown>
  >;
  let candidateRepository: MockCandidateRepository;
  let decisionRepository: MockDecisionRepository;
  let reservationRepository: MockReservationRepository;
  let riskConfigRepository: MockRiskConfigRepository;
  let tradeSizingService: MockTradeSizingService;
  let riskRuleEngine: MockRiskRuleEngine;
  let eventFactory: MockTradeDecisionEventFactory;
  let eventDispatcher: MockEventDispatcher;

  const candidateMessage = PortfolioSignalCandidate.fromPartial({
    signal: Signal.fromPartial({
      id: 'signal-1',
      instrumentId: 'instrument-1',
      side: SignalSide.BUY,
      price: 100,
      timestamp: new Date('2026-03-25T12:00:00.000Z').getTime(),
    }),
    sourceEventId: 'event-1',
    portfolioId: 'portfolio-1',
    candidateIdempotencyKey: 'event-1:portfolio-1',
    signalReceivedAt: '2026-03-25T12:00:01.000Z',
  });
  const candidateRecord = {
    id: 'candidate-1',
    candidateIdempotencyKey: 'event-1:portfolio-1',
    sourceEventId: 'event-1',
    portfolioId: 'portfolio-1',
    instrumentId: 'instrument-1',
    signalId: 'signal-1',
    side: SignalSide.BUY,
    referencePrice: toPrismaDecimal('100'),
    targetNotionalSnapshot: toPrismaDecimal('100'),
    signalTimestamp: new Date('2026-03-25T12:00:00.000Z'),
    receivedAt: new Date('2026-03-25T12:00:01.000Z'),
  };
  const config = {
    portfolioId: 'portfolio-1',
    instrumentId: 'instrument-1',
    enabled: true,
    targetNotional: toPrismaDecimal('100'),
    maxTradeNotional: toPrismaDecimal('150'),
    maxPositionNotional: toPrismaDecimal('300'),
    portfolioExposureCapNotional: toPrismaDecimal('400'),
  };

  beforeEach(() => {
    transactionMock = jest.fn((callback) => callback({}));
    prisma = {
      $transaction: transactionMock as unknown as TransactionMethod,
    };
    candidateRepository = {
      create: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      markDecided: jest.fn(),
    };
    decisionRepository = {
      findByCandidateIdempotencyKey: jest.fn(),
      create: jest.fn(),
    };
    reservationRepository = {
      sumActivePortfolioReservedNotional: jest.fn(),
      sumActiveInstrumentReservedNotional: jest.fn(),
      create: jest.fn(),
    };
    riskConfigRepository = {
      instrumentExists: jest.fn(),
      findConfigsByInstrumentId: jest.fn(),
      findConfig: jest.fn(),
    };
    tradeSizingService = {
      sizeTrade: jest.fn(),
    };
    riskRuleEngine = {
      evaluate: jest.fn(),
    };
    eventFactory = {
      create: jest.fn(),
    };
    eventDispatcher = {
      enqueueEvent: jest.fn(),
    };

    service = new PortfolioStageService(
      prisma as unknown as PrismaService,
      candidateRepository as unknown as CandidateRepository,
      decisionRepository as unknown as DecisionRepository,
      reservationRepository as unknown as ReservationRepository,
      riskConfigRepository as unknown as RiskConfigRepository,
      tradeSizingService,
      riskRuleEngine,
      eventFactory,
      eventDispatcher as unknown as EventDispatcherService,
    );
  });

  it('skips duplicate decisions', async () => {
    decisionRepository.findByCandidateIdempotencyKey.mockResolvedValue({
      id: 'decision-1',
      candidateIdempotencyKey: 'event-1:portfolio-1',
      sourceEventId: 'event-1',
      portfolioId: 'portfolio-1',
      instrumentId: 'instrument-1',
      decision: RiskDecisionStatus.APPROVED,
      reasonCodes: [],
      requestedNotional: toPrismaDecimal('100'),
      requestedQuantity: toPrismaDecimal('1'),
      referencePrice: toPrismaDecimal('100'),
      emittedTopic: KAFKA_TOPICS.TRADES_APPROVED,
      decidedAt: new Date(),
    });

    await service.handleCandidate(candidateMessage);

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('creates decisions, reservations, and final outbox events for approved trades', async () => {
    decisionRepository.findByCandidateIdempotencyKey.mockResolvedValue(null);
    candidateRepository.findByIdempotencyKey.mockResolvedValue(candidateRecord);
    riskConfigRepository.findConfig.mockResolvedValue(config);
    tradeSizingService.sizeTrade.mockReturnValue({
      requestedNotional: toPrismaDecimal('100'),
      requestedQuantity: toPrismaDecimal('1'),
      referencePrice: toPrismaDecimal('100'),
    });
    reservationRepository.sumActiveInstrumentReservedNotional.mockResolvedValue(
      toPrismaDecimal('0'),
    );
    reservationRepository.sumActivePortfolioReservedNotional.mockResolvedValue(
      toPrismaDecimal('0'),
    );
    riskRuleEngine.evaluate.mockReturnValue({
      decision: RiskDecisionStatus.APPROVED,
      reasonCodes: [],
      requestedNotional: toPrismaDecimal('100'),
      requestedQuantity: toPrismaDecimal('1'),
      referencePrice: toPrismaDecimal('100'),
    });
    decisionRepository.create.mockResolvedValue({
      id: 'decision-1',
      candidateIdempotencyKey: candidateRecord.candidateIdempotencyKey,
      sourceEventId: candidateRecord.sourceEventId,
      portfolioId: candidateRecord.portfolioId,
      instrumentId: candidateRecord.instrumentId,
      decision: RiskDecisionStatus.APPROVED,
      reasonCodes: [],
      requestedNotional: toPrismaDecimal('100'),
      requestedQuantity: toPrismaDecimal('1'),
      referencePrice: toPrismaDecimal('100'),
      emittedTopic: KAFKA_TOPICS.TRADES_APPROVED,
      decidedAt: new Date('2026-03-25T12:00:02.000Z'),
    });
    eventFactory.create.mockReturnValue({
      topic: KAFKA_TOPICS.TRADES_APPROVED,
      message: {
        key: 'portfolio-1',
        value: new Uint8Array([1]),
        headers: {},
      },
    });

    await service.handleCandidate(candidateMessage);

    const [reservationInput] = reservationRepository.create.mock.calls[0] ?? [];
    expect(reservationInput?.portfolioId).toBe('portfolio-1');
    expect(reservationInput?.instrumentId).toBe('instrument-1');
    expect(reservationInput?.reservedNotional.toString()).toBe('100');
    expect(candidateRepository.markDecided).toHaveBeenCalledWith(
      'candidate-1',
      expect.any(Object),
    );
    expect(eventDispatcher.enqueueEvent).toHaveBeenCalledWith(
      expect.any(Object),
      KAFKA_TOPICS.TRADES_APPROVED,
      expect.objectContaining({
        key: 'portfolio-1',
      }),
    );
  });

  it('creates a deterministic rejection when the config is missing or inactive', async () => {
    decisionRepository.findByCandidateIdempotencyKey.mockResolvedValue(null);
    candidateRepository.findByIdempotencyKey.mockResolvedValue(candidateRecord);
    riskConfigRepository.findConfig.mockResolvedValue(null);
    tradeSizingService.sizeTrade.mockReturnValue({
      requestedNotional: toPrismaDecimal('100'),
      requestedQuantity: toPrismaDecimal('1'),
      referencePrice: toPrismaDecimal('100'),
    });
    reservationRepository.sumActiveInstrumentReservedNotional.mockResolvedValue(
      toPrismaDecimal('0'),
    );
    reservationRepository.sumActivePortfolioReservedNotional.mockResolvedValue(
      toPrismaDecimal('0'),
    );
    decisionRepository.create.mockResolvedValue({
      id: 'decision-1',
      candidateIdempotencyKey: candidateRecord.candidateIdempotencyKey,
      sourceEventId: candidateRecord.sourceEventId,
      portfolioId: candidateRecord.portfolioId,
      instrumentId: candidateRecord.instrumentId,
      decision: RiskDecisionStatus.REJECTED,
      reasonCodes: [RiskDecisionReasonCode.SUBSCRIPTION_DISABLED],
      requestedNotional: toPrismaDecimal('100'),
      requestedQuantity: toPrismaDecimal('1'),
      referencePrice: toPrismaDecimal('100'),
      emittedTopic: KAFKA_TOPICS.TRADES_REJECTED,
      decidedAt: new Date('2026-03-25T12:00:02.000Z'),
    });
    eventFactory.create.mockReturnValue({
      topic: KAFKA_TOPICS.TRADES_REJECTED,
      message: {
        key: 'portfolio-1',
        value: new Uint8Array([1]),
        headers: {},
      },
    });

    await service.handleCandidate(candidateMessage);

    expect(riskRuleEngine.evaluate).not.toHaveBeenCalled();
    const [decisionInput] = decisionRepository.create.mock.calls[0] ?? [];
    expect(decisionInput?.decision).toBe(RiskDecisionStatus.REJECTED);
    expect(decisionInput?.reasonCodes).toEqual([
      RiskDecisionReasonCode.SUBSCRIPTION_DISABLED,
    ]);
    expect(decisionInput?.requestedNotional.toString()).toBe('100');
    expect(reservationRepository.create).not.toHaveBeenCalled();
  });

  it('creates rejected decisions without reservations', async () => {
    decisionRepository.findByCandidateIdempotencyKey.mockResolvedValue(null);
    candidateRepository.findByIdempotencyKey.mockResolvedValue(candidateRecord);
    riskConfigRepository.findConfig.mockResolvedValue(config);
    tradeSizingService.sizeTrade.mockReturnValue({
      requestedNotional: toPrismaDecimal('100'),
      requestedQuantity: toPrismaDecimal('1'),
      referencePrice: toPrismaDecimal('100'),
    });
    reservationRepository.sumActiveInstrumentReservedNotional.mockResolvedValue(
      toPrismaDecimal('0'),
    );
    reservationRepository.sumActivePortfolioReservedNotional.mockResolvedValue(
      toPrismaDecimal('350'),
    );
    riskRuleEngine.evaluate.mockReturnValue({
      decision: RiskDecisionStatus.REJECTED,
      reasonCodes: [RiskDecisionReasonCode.PORTFOLIO_EXPOSURE_CAP_EXCEEDED],
      requestedNotional: toPrismaDecimal('100'),
      requestedQuantity: toPrismaDecimal('1'),
      referencePrice: toPrismaDecimal('100'),
    });
    decisionRepository.create.mockResolvedValue({
      id: 'decision-1',
      candidateIdempotencyKey: candidateRecord.candidateIdempotencyKey,
      sourceEventId: candidateRecord.sourceEventId,
      portfolioId: candidateRecord.portfolioId,
      instrumentId: candidateRecord.instrumentId,
      decision: RiskDecisionStatus.REJECTED,
      reasonCodes: [RiskDecisionReasonCode.PORTFOLIO_EXPOSURE_CAP_EXCEEDED],
      requestedNotional: toPrismaDecimal('100'),
      requestedQuantity: toPrismaDecimal('1'),
      referencePrice: toPrismaDecimal('100'),
      emittedTopic: KAFKA_TOPICS.TRADES_REJECTED,
      decidedAt: new Date('2026-03-25T12:00:02.000Z'),
    });
    eventFactory.create.mockReturnValue({
      topic: KAFKA_TOPICS.TRADES_REJECTED,
      message: {
        key: 'portfolio-1',
        value: new Uint8Array([1]),
        headers: {},
      },
    });

    await service.handleCandidate(candidateMessage);

    expect(reservationRepository.create).not.toHaveBeenCalled();
    expect(eventDispatcher.enqueueEvent).toHaveBeenCalledWith(
      expect.any(Object),
      KAFKA_TOPICS.TRADES_REJECTED,
      expect.objectContaining({
        key: 'portfolio-1',
      }),
    );
  });
});
