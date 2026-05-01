import { Injectable } from '@nestjs/common';

import { PrismaDecimal } from '../../prisma/prisma-decimal';
import { SizedTrade } from '../types/risk-types';

@Injectable()
export class TradeSizingService {
  sizeTrade(
    targetNotional: PrismaDecimal,
    referencePrice: PrismaDecimal,
  ): SizedTrade {
    if (referencePrice.lte(0)) {
      throw new Error('referencePrice must be greater than zero');
    }

    return {
      requestedNotional: targetNotional,
      requestedQuantity: targetNotional.div(referencePrice),
      referencePrice,
    };
  }
}
