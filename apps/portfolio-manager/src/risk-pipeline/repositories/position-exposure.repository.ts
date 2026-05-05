import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { PrismaDbClient } from '../../prisma/prisma-db-client';
import {
  toPrismaDecimal,
  zeroPrismaDecimal,
} from '../../prisma/prisma-decimal';

@Injectable()
export class PositionExposureRepository {
  constructor(private readonly prisma: PrismaService) {}

  async sumPortfolioPositionExposure(
    portfolioId: string,
    client: PrismaDbClient = this.prisma,
  ) {
    const result = await client.portfolioPosition.aggregate({
      where: { portfolioId },
      _sum: { exposureNotional: true },
    });

    return result._sum.exposureNotional
      ? toPrismaDecimal(result._sum.exposureNotional)
      : zeroPrismaDecimal();
  }

  async sumInstrumentPositionExposure(
    portfolioId: string,
    instrumentId: string,
    client: PrismaDbClient = this.prisma,
  ) {
    const result = await client.portfolioPosition.aggregate({
      where: {
        portfolioId,
        instrumentId,
      },
      _sum: { exposureNotional: true },
    });

    return result._sum.exposureNotional
      ? toPrismaDecimal(result._sum.exposureNotional)
      : zeroPrismaDecimal();
  }
}
