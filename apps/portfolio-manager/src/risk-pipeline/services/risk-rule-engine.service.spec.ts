import {
  RiskDecisionReasonCode,
  RiskDecisionStatus,
} from '../../prisma/generated/enums';
import {
  toPrismaDecimal,
  zeroPrismaDecimal,
} from '../../prisma/prisma-decimal';
import { RiskRuleEngine } from './risk-rule-engine.service';

describe('RiskRuleEngine', () => {
  const service = new RiskRuleEngine();
  const config = {
    portfolioId: 'portfolio-1',
    instrumentId: 'instrument-1',
    enabled: true,
    targetNotional: toPrismaDecimal('100'),
    maxTradeNotional: toPrismaDecimal('150'),
    maxPositionNotional: toPrismaDecimal('200'),
    portfolioExposureCapNotional: toPrismaDecimal('300'),
    maxOpenTrades: null,
    maxDailyTurnoverNotional: null,
    cooldownSeconds: null,
    maxConsecutiveRejections: null,
  };
  const trade = {
    requestedNotional: toPrismaDecimal('100'),
    requestedQuantity: toPrismaDecimal('2'),
    referencePrice: toPrismaDecimal('50'),
  };
  const expectSizedTrade = (
    result: ReturnType<RiskRuleEngine['evaluate']>,
    values: { notional: string; quantity: string; price: string },
  ) => {
    expect(result.requestedNotional.toString()).toBe(values.notional);
    expect(result.requestedQuantity.toString()).toBe(values.quantity);
    expect(result.referencePrice.toString()).toBe(values.price);
  };

  it('approves when the trade is within all limits', () => {
    const result = service.evaluate({
      config,
      trade,
      activeInstrumentReservedNotional: toPrismaDecimal('50'),
      activePortfolioReservedNotional: toPrismaDecimal('75'),
      activeInstrumentReservationCount: 0,
      dailyTradedNotional: zeroPrismaDecimal(),
    });

    expect(result.decision).toBe(RiskDecisionStatus.APPROVED);
    expect(result.reasonCodes).toEqual([]);
    expectSizedTrade(result, { notional: '100', quantity: '2', price: '50' });
  });

  it('rejects disabled subscriptions first', () => {
    const result = service.evaluate({
      config: {
        ...config,
        enabled: false,
      },
      trade,
      activeInstrumentReservedNotional: toPrismaDecimal('0'),
      activePortfolioReservedNotional: toPrismaDecimal('0'),
      activeInstrumentReservationCount: 0,
      dailyTradedNotional: zeroPrismaDecimal(),
    });

    expect(result.decision).toBe(RiskDecisionStatus.REJECTED);
    expect(result.reasonCodes).toEqual([
      RiskDecisionReasonCode.SUBSCRIPTION_DISABLED,
    ]);
    expectSizedTrade(result, { notional: '100', quantity: '2', price: '50' });
  });

  it('rejects when the trade cap is exceeded', () => {
    const result = service.evaluate({
      config,
      trade: {
        ...trade,
        requestedNotional: toPrismaDecimal('175'),
      },
      activeInstrumentReservedNotional: toPrismaDecimal('0'),
      activePortfolioReservedNotional: toPrismaDecimal('0'),
      activeInstrumentReservationCount: 0,
      dailyTradedNotional: zeroPrismaDecimal(),
    });

    expect(result.decision).toBe(RiskDecisionStatus.REJECTED);
    expect(result.reasonCodes).toEqual([
      RiskDecisionReasonCode.TRADE_CAP_EXCEEDED,
    ]);
    expectSizedTrade(result, { notional: '175', quantity: '2', price: '50' });
  });

  it('rejects when instrument reserved exposure is exceeded', () => {
    const result = service.evaluate({
      config,
      trade,
      activeInstrumentReservedNotional: toPrismaDecimal('150'),
      activePortfolioReservedNotional: toPrismaDecimal('0'),
      activeInstrumentReservationCount: 0,
      dailyTradedNotional: zeroPrismaDecimal(),
    });

    expect(result.decision).toBe(RiskDecisionStatus.REJECTED);
    expect(result.reasonCodes).toEqual([
      RiskDecisionReasonCode.INSTRUMENT_EXPOSURE_CAP_EXCEEDED,
    ]);
    expectSizedTrade(result, { notional: '100', quantity: '2', price: '50' });
  });

  it('rejects when portfolio exposure is exceeded', () => {
    const result = service.evaluate({
      config,
      trade,
      activeInstrumentReservedNotional: toPrismaDecimal('0'),
      activePortfolioReservedNotional: toPrismaDecimal('250'),
      activeInstrumentReservationCount: 0,
      dailyTradedNotional: zeroPrismaDecimal(),
    });

    expect(result.decision).toBe(RiskDecisionStatus.REJECTED);
    expect(result.reasonCodes).toEqual([
      RiskDecisionReasonCode.PORTFOLIO_EXPOSURE_CAP_EXCEEDED,
    ]);
    expectSizedTrade(result, { notional: '100', quantity: '2', price: '50' });
  });

  describe('maxOpenTrades rule', () => {
    it('rejects when active reservation count equals maxOpenTrades', () => {
      const result = service.evaluate({
        config: { ...config, maxOpenTrades: 2 },
        trade,
        activeInstrumentReservedNotional: toPrismaDecimal('50'),
        activePortfolioReservedNotional: toPrismaDecimal('75'),
        activeInstrumentReservationCount: 2,
        dailyTradedNotional: zeroPrismaDecimal(),
      });

      expect(result.decision).toBe(RiskDecisionStatus.REJECTED);
      expect(result.reasonCodes).toEqual([
        RiskDecisionReasonCode.MAX_OPEN_TRADES_EXCEEDED,
      ]);
    });

    it('approves when active reservation count is below maxOpenTrades', () => {
      const result = service.evaluate({
        config: { ...config, maxOpenTrades: 3 },
        trade,
        activeInstrumentReservedNotional: toPrismaDecimal('50'),
        activePortfolioReservedNotional: toPrismaDecimal('75'),
        activeInstrumentReservationCount: 2,
        dailyTradedNotional: zeroPrismaDecimal(),
      });

      expect(result.decision).toBe(RiskDecisionStatus.APPROVED);
      expect(result.reasonCodes).toEqual([]);
    });

    it('approves when maxOpenTrades is null', () => {
      const result = service.evaluate({
        config: { ...config, maxOpenTrades: null },
        trade,
        activeInstrumentReservedNotional: toPrismaDecimal('0'),
        activePortfolioReservedNotional: toPrismaDecimal('0'),
        activeInstrumentReservationCount: 99,
        dailyTradedNotional: zeroPrismaDecimal(),
      });

      expect(result.decision).toBe(RiskDecisionStatus.APPROVED);
      expect(result.reasonCodes).toEqual([]);
    });
  });

  describe('maxDailyTurnoverNotional rule', () => {
    it('rejects when daily traded notional reaches the limit', () => {
      const result = service.evaluate({
        config: {
          ...config,
          maxDailyTurnoverNotional: toPrismaDecimal('500'),
        },
        trade,
        activeInstrumentReservedNotional: toPrismaDecimal('0'),
        activePortfolioReservedNotional: toPrismaDecimal('0'),
        activeInstrumentReservationCount: 0,
        dailyTradedNotional: toPrismaDecimal('450'),
      });

      expect(result.decision).toBe(RiskDecisionStatus.REJECTED);
      expect(result.reasonCodes).toEqual([
        RiskDecisionReasonCode.DAILY_TURNOVER_LIMIT_EXCEEDED,
      ]);
    });

    it('approves when daily traded notional is below the limit', () => {
      const result = service.evaluate({
        config: {
          ...config,
          maxDailyTurnoverNotional: toPrismaDecimal('500'),
        },
        trade,
        activeInstrumentReservedNotional: toPrismaDecimal('0'),
        activePortfolioReservedNotional: toPrismaDecimal('0'),
        activeInstrumentReservationCount: 0,
        dailyTradedNotional: toPrismaDecimal('300'),
      });

      expect(result.decision).toBe(RiskDecisionStatus.APPROVED);
      expect(result.reasonCodes).toEqual([]);
    });

    it('approves when maxDailyTurnoverNotional is null', () => {
      const result = service.evaluate({
        config: { ...config, maxDailyTurnoverNotional: null },
        trade,
        activeInstrumentReservedNotional: toPrismaDecimal('0'),
        activePortfolioReservedNotional: toPrismaDecimal('0'),
        activeInstrumentReservationCount: 0,
        dailyTradedNotional: toPrismaDecimal('999999'),
      });

      expect(result.decision).toBe(RiskDecisionStatus.APPROVED);
      expect(result.reasonCodes).toEqual([]);
    });
  });
});
