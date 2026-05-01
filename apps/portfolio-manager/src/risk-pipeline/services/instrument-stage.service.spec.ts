import { KAFKA_TOPICS } from '@trading-bot/common';
import { Signal, SignalSide } from '@trading-bot/common/proto';

import { EventDispatcherService } from '../../event-dispatcher/event-dispatcher.service';
import { SignalReceiptStatus } from '../../prisma/generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { PortfolioSignalCandidateEventFactory } from '../events/portfolio-signal-candidate-event.factory';
import { CandidateRepository } from '../repositories/candidate.repository';
import { RiskConfigRepository } from '../repositories/risk-config.repository';
import { SignalReceiptRepository } from '../repositories/signal-receipt.repository';
import { InstrumentStageService } from './instrument-stage.service';

type TransactionMethod = <T>(
  callback: (tx: object) => Promise<T>,
) => Promise<T>;
type MockRiskConfigRepository = {
  instrumentExists: jest.MockedFunction<
    RiskConfigRepository['instrumentExists']
  >;
  findConfigsByInstrumentId: jest.MockedFunction<
    RiskConfigRepository['findConfigsByInstrumentId']
  >;
  findConfig: jest.MockedFunction<RiskConfigRepository['findConfig']>;
};
type MockSignalReceiptRepository = {
  findBySourceEventId: jest.MockedFunction<
    SignalReceiptRepository['findBySourceEventId']
  >;
  create: jest.MockedFunction<SignalReceiptRepository['create']>;
};
type MockCandidateRepository = {
  create: jest.MockedFunction<CandidateRepository['create']>;
  findByIdempotencyKey: jest.MockedFunction<
    CandidateRepository['findByIdempotencyKey']
  >;
  markDecided: jest.MockedFunction<CandidateRepository['markDecided']>;
};
type MockPortfolioSignalCandidateEventFactory = {
  create: jest.MockedFunction<PortfolioSignalCandidateEventFactory['create']>;
};
type MockEventDispatcher = {
  enqueueEvent: jest.MockedFunction<EventDispatcherService['enqueueEvent']>;
};

describe('InstrumentStageService', () => {
  let service: InstrumentStageService;
  let prisma: { $transaction: TransactionMethod };
  let transactionMock: jest.MockedFunction<
    (callback: (tx: object) => Promise<unknown>) => Promise<unknown>
  >;
  let riskConfigRepository: MockRiskConfigRepository;
  let signalReceiptRepository: MockSignalReceiptRepository;
  let candidateRepository: MockCandidateRepository;
  let eventFactory: MockPortfolioSignalCandidateEventFactory;
  let eventDispatcher: MockEventDispatcher;

  const signal = Signal.fromPartial({
    id: 'signal-1',
    instrumentId: 'instrument-1',
    side: SignalSide.BUY,
    price: 100,
    timestamp: new Date('2026-03-25T12:00:00.000Z').getTime(),
  });

  beforeEach(() => {
    transactionMock = jest.fn((callback) => callback({}));
    prisma = {
      $transaction: transactionMock as unknown as TransactionMethod,
    };
    riskConfigRepository = {
      instrumentExists: jest.fn(),
      findConfigsByInstrumentId: jest.fn(),
      findConfig: jest.fn(),
    };
    signalReceiptRepository = {
      findBySourceEventId: jest.fn(),
      create: jest.fn(),
    };
    candidateRepository = {
      create: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      markDecided: jest.fn(),
    };
    eventFactory = {
      create: jest.fn(),
    };
    eventDispatcher = {
      enqueueEvent: jest.fn(),
    };

    service = new InstrumentStageService(
      prisma as unknown as PrismaService,
      riskConfigRepository as unknown as RiskConfigRepository,
      signalReceiptRepository as unknown as SignalReceiptRepository,
      candidateRepository as unknown as CandidateRepository,
      eventFactory,
      eventDispatcher as unknown as EventDispatcherService,
    );
  });

  it('skips duplicate source events', async () => {
    signalReceiptRepository.findBySourceEventId.mockResolvedValue({
      id: 'receipt-1',
      sourceEventId: 'event-1',
      status: SignalReceiptStatus.FANNED_OUT,
      eligiblePortfolioCount: 1,
    });

    await service.handleSignal({
      sourceEventId: 'event-1',
      kafkaKey: 'BINANCE:instrument-1',
      receivedAt: new Date(),
      signal,
    });

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('writes audit-only receipts for unknown instruments', async () => {
    signalReceiptRepository.findBySourceEventId.mockResolvedValue(null);
    riskConfigRepository.instrumentExists.mockResolvedValue(false);
    signalReceiptRepository.create.mockResolvedValue({
      id: 'receipt-1',
      sourceEventId: 'event-1',
      status: SignalReceiptStatus.UNKNOWN_INSTRUMENT,
      eligiblePortfolioCount: 0,
    });

    await service.handleSignal({
      sourceEventId: 'event-1',
      kafkaKey: 'BINANCE:instrument-1',
      receivedAt: new Date('2026-03-25T12:00:00.000Z'),
      signal,
    });

    expect(signalReceiptRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceEventId: 'event-1',
        status: SignalReceiptStatus.UNKNOWN_INSTRUMENT,
        eligiblePortfolioCount: 0,
      }),
      expect.any(Object),
    );
    expect(candidateRepository.create).not.toHaveBeenCalled();
    expect(eventDispatcher.enqueueEvent).not.toHaveBeenCalled();
  });

  it('fans out to subscribed portfolios even when the config is disabled', async () => {
    signalReceiptRepository.findBySourceEventId.mockResolvedValue(null);
    riskConfigRepository.instrumentExists.mockResolvedValue(true);
    riskConfigRepository.findConfigsByInstrumentId.mockResolvedValue([
      {
        portfolioId: 'portfolio-1',
        instrumentId: 'instrument-1',
        enabled: false,
        targetNotional: toPrismaDecimal('100'),
        maxTradeNotional: toPrismaDecimal('150'),
        maxPositionNotional: toPrismaDecimal('250'),
        portfolioExposureCapNotional: toPrismaDecimal('500'),
      },
    ]);
    signalReceiptRepository.create.mockResolvedValue({
      id: 'receipt-1',
      sourceEventId: 'event-1',
      status: SignalReceiptStatus.FANNED_OUT,
      eligiblePortfolioCount: 1,
    });
    candidateRepository.create.mockResolvedValue({
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
    });
    eventFactory.create.mockReturnValue({
      topic: KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO,
      message: {
        key: 'portfolio-1',
        value: new Uint8Array([1]),
        headers: {},
      },
    });

    await service.handleSignal({
      sourceEventId: 'event-1',
      kafkaKey: 'BINANCE:instrument-1',
      receivedAt: new Date('2026-03-25T12:00:01.000Z'),
      signal,
    });

    expect(candidateRepository.create).toHaveBeenCalledTimes(1);
    const [candidateInput] = candidateRepository.create.mock.calls[0] ?? [];
    expect(candidateInput?.targetNotionalSnapshot.toString()).toBe('100');
    expect(eventDispatcher.enqueueEvent).toHaveBeenCalledWith(
      expect.any(Object),
      KAFKA_TOPICS.TRADING_SIGNALS_PORTFOLIO,
      expect.objectContaining({
        key: 'portfolio-1',
      }),
    );
  });
});
