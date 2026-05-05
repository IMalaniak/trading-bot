import { SignalSide } from '@trading-bot/common/proto';

import { PositionAccountingService } from '../../fill-reconciliation/services/position-accounting.service';
import { ExposureReservationStatus } from '../../prisma/generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { PositionExposureRepository } from './position-exposure.repository';

interface PortfolioFillFindManyArgs {
  where: {
    instrumentId?: string;
    candidateIdempotencyKey?: {
      notIn?: string[];
    };
  };
}

describe('PositionExposureRepository', () => {
  const prisma = {} as PrismaService;
  const repository = new PositionExposureRepository(
    prisma,
    new PositionAccountingService(),
  );

  const createClient = ({
    activeReservationKeys,
  }: {
    activeReservationKeys: string[];
  }) => {
    const fills = [
      {
        id: 'settled-fill',
        instrumentId: 'instrument-1',
        candidateIdempotencyKey: 'settled-candidate',
        side: SignalSide.BUY,
        sequence: 1,
        fillQuantity: toPrismaDecimal('1'),
        fillPrice: toPrismaDecimal('100'),
        filledAt: new Date('2026-03-25T12:00:00.000Z'),
      },
      {
        id: 'active-fill',
        instrumentId: 'instrument-1',
        candidateIdempotencyKey: 'active-candidate',
        side: SignalSide.BUY,
        sequence: 1,
        fillQuantity: toPrismaDecimal('0.5'),
        fillPrice: toPrismaDecimal('100'),
        filledAt: new Date('2026-03-25T12:00:01.000Z'),
      },
    ];

    return {
      exposureReservation: {
        findMany: jest.fn().mockResolvedValue(
          activeReservationKeys.map((candidateIdempotencyKey) => ({
            candidateIdempotencyKey,
            status: ExposureReservationStatus.ACTIVE,
          })),
        ),
      },
      portfolioFill: {
        findMany: jest.fn(({ where }: PortfolioFillFindManyArgs) =>
          Promise.resolve(
            fills.filter((fill) => {
              const excludedKeys: string[] =
                where.candidateIdempotencyKey?.notIn ?? [];

              return (
                fill.instrumentId ===
                  (where.instrumentId ?? fill.instrumentId) &&
                !excludedKeys.includes(fill.candidateIdempotencyKey)
              );
            }),
          ),
        ),
      },
    };
  };

  it('excludes fills still covered by active reservations from settled instrument exposure', async () => {
    const client = createClient({
      activeReservationKeys: ['active-candidate'],
    });

    const exposure = await repository.sumInstrumentPositionExposure(
      'portfolio-1',
      'instrument-1',
      client as never,
    );

    expect(exposure.toString()).toBe('100');
  });

  it('includes active-reservation fills after their reservation is released', async () => {
    const client = createClient({
      activeReservationKeys: [],
    });

    const exposure = await repository.sumInstrumentPositionExposure(
      'portfolio-1',
      'instrument-1',
      client as never,
    );

    expect(exposure.toString()).toBe('150');
  });

  it('uses the same active-reservation exclusion for portfolio exposure', async () => {
    const client = createClient({
      activeReservationKeys: ['active-candidate'],
    });

    const exposure = await repository.sumPortfolioPositionExposure(
      'portfolio-1',
      client as never,
    );

    expect(exposure.toString()).toBe('100');
  });
});
