import { SignalSide } from '@trading-bot/common/proto';
import { describe, expect, it } from 'vitest';

import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { CandidateRecord, SizedTrade } from '../types/risk-types';
import {
  PortfolioStrategyConfig,
  StrategyFilterService,
} from './strategy-filter.service';

const makeTrade = (): SizedTrade => ({
  requestedNotional: toPrismaDecimal('100'),
  requestedQuantity: toPrismaDecimal('1'),
  referencePrice: toPrismaDecimal('100'),
});

const makeCandidate = (
  overrides: Partial<CandidateRecord> = {},
): CandidateRecord => ({
  id: 'cand-1',
  candidateIdempotencyKey: 'key-1',
  sourceEventId: 'src-1',
  portfolioId: 'portfolio-alpha',
  instrumentId: 'instrument-1',
  signalId: 'signal-1',
  side: SignalSide.BUY,
  referencePrice: toPrismaDecimal('100'),
  targetNotionalSnapshot: toPrismaDecimal('100'),
  signalTimestamp: new Date('2026-01-01T12:00:00.000Z'),
  receivedAt: new Date('2026-01-01T12:00:01.000Z'),
  ...overrides,
});

describe('StrategyFilterService', () => {
  const service = new StrategyFilterService();

  describe('given no strategy assigned', () => {
    it('returns null (no filter applied)', () => {
      const result = service.evaluate({
        candidate: makeCandidate(),
        strategy: null,
        trade: makeTrade(),
      });

      expect(result).toBeNull();
    });
  });

  describe('given a SELL-only strategy (allowedSides: [2])', () => {
    const strategy: PortfolioStrategyConfig = { allowedSides: [2] };

    it('rejects BUY signal with STRATEGY_SIDE_FILTER', () => {
      const result = service.evaluate({
        candidate: makeCandidate({ side: SignalSide.BUY }),
        strategy,
        trade: makeTrade(),
      });

      expect(result?.decision).toBe('REJECTED');
      expect(result?.reasonCodes).toContain('STRATEGY_SIDE_FILTER');
    });

    it('returns null (passes) for SELL signal', () => {
      const result = service.evaluate({
        candidate: makeCandidate({ side: SignalSide.SELL }),
        strategy,
        trade: makeTrade(),
      });

      expect(result).toBeNull();
    });
  });

  describe('given a BUY+SELL strategy (allowedSides: [1, 2])', () => {
    const strategy: PortfolioStrategyConfig = { allowedSides: [1, 2] };

    it('returns null for BUY signal', () => {
      const result = service.evaluate({
        candidate: makeCandidate({ side: SignalSide.BUY }),
        strategy,
        trade: makeTrade(),
      });

      expect(result).toBeNull();
    });

    it('returns null for SELL signal', () => {
      const result = service.evaluate({
        candidate: makeCandidate({ side: SignalSide.SELL }),
        strategy,
        trade: makeTrade(),
      });

      expect(result).toBeNull();
    });
  });

  describe('given strategy with active time window 09:00–17:00 UTC', () => {
    const strategy: PortfolioStrategyConfig = {
      allowedSides: [],
      activeTimeStart: '09:00',
      activeTimeEnd: '17:00',
    };

    it('passes signal at 12:00 UTC (within window)', () => {
      const result = service.evaluate({
        candidate: makeCandidate({
          signalTimestamp: new Date('2026-01-01T12:00:00.000Z'),
        }),
        strategy,
        trade: makeTrade(),
      });

      expect(result).toBeNull();
    });

    it('rejects signal at 08:59 UTC (before window) with STRATEGY_TIME_FILTER', () => {
      const result = service.evaluate({
        candidate: makeCandidate({
          signalTimestamp: new Date('2026-01-01T08:59:00.000Z'),
        }),
        strategy,
        trade: makeTrade(),
      });

      expect(result?.decision).toBe('REJECTED');
      expect(result?.reasonCodes).toContain('STRATEGY_TIME_FILTER');
    });

    it('rejects signal at 17:01 UTC (after window) with STRATEGY_TIME_FILTER', () => {
      const result = service.evaluate({
        candidate: makeCandidate({
          signalTimestamp: new Date('2026-01-01T17:01:00.000Z'),
        }),
        strategy,
        trade: makeTrade(),
      });

      expect(result?.decision).toBe('REJECTED');
      expect(result?.reasonCodes).toContain('STRATEGY_TIME_FILTER');
    });
  });

  describe('given strategy with minIntervalSecs: 300 (5 min cooldown)', () => {
    const strategy: PortfolioStrategyConfig = {
      allowedSides: [],
      minIntervalSecs: 300,
    };

    it('returns null when no previous approval', () => {
      const result = service.evaluate({
        candidate: makeCandidate(),
        strategy,
        trade: makeTrade(),
        lastApprovedAt: null,
      });

      expect(result).toBeNull();
    });

    it('rejects when within cooldown period with STRATEGY_COOLDOWN_FILTER', () => {
      const lastApprovedAt = new Date('2026-01-01T12:00:00.000Z');
      const receivedAt = new Date('2026-01-01T12:04:00.000Z'); // 4 min < 5 min

      const result = service.evaluate({
        candidate: makeCandidate({ receivedAt }),
        strategy,
        trade: makeTrade(),
        lastApprovedAt,
      });

      expect(result?.decision).toBe('REJECTED');
      expect(result?.reasonCodes).toContain('STRATEGY_COOLDOWN_FILTER');
    });

    it('returns null (passes) after cooldown has elapsed', () => {
      const lastApprovedAt = new Date('2026-01-01T12:00:00.000Z');
      const receivedAt = new Date('2026-01-01T12:06:00.000Z'); // 6 min > 5 min

      const result = service.evaluate({
        candidate: makeCandidate({ receivedAt }),
        strategy,
        trade: makeTrade(),
        lastApprovedAt,
      });

      expect(result).toBeNull();
    });
  });
});
