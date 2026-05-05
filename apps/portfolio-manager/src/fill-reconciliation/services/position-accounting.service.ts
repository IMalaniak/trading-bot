import { Injectable } from '@nestjs/common';
import { SignalSide } from '@trading-bot/common/proto';

import { PrismaDecimal, zeroPrismaDecimal } from '../../prisma/prisma-decimal';
import {
  PositionAccountingFill,
  PositionState,
} from '../types/fill-reconciliation-types';

const absolute = (value: PrismaDecimal): PrismaDecimal =>
  value.isNegative() ? value.negated() : value;

const signedFillQuantity = (side: SignalSide, quantity: PrismaDecimal) => {
  if (side === SignalSide.BUY) {
    return quantity;
  }

  if (side === SignalSide.SELL) {
    return quantity.negated();
  }

  throw new Error(`Unsupported fill side '${String(side)}'`);
};

const isSameDirection = (
  currentQuantity: PrismaDecimal,
  deltaQuantity: PrismaDecimal,
): boolean =>
  (currentQuantity.gt(0) && deltaQuantity.gt(0)) ||
  (currentQuantity.lt(0) && deltaQuantity.lt(0));

@Injectable()
export class PositionAccountingService {
  calculate(fills: readonly PositionAccountingFill[]): PositionState {
    const orderedFills = [...fills].sort((left, right) => {
      const filledAtDelta = left.filledAt.getTime() - right.filledAt.getTime();

      if (filledAtDelta !== 0) {
        return filledAtDelta;
      }

      const sequenceDelta = left.sequence - right.sequence;

      if (sequenceDelta !== 0) {
        return sequenceDelta;
      }

      return left.id.localeCompare(right.id);
    });

    let quantity = zeroPrismaDecimal();
    let averageEntryPrice = zeroPrismaDecimal();

    for (const fill of orderedFills) {
      const deltaQuantity = signedFillQuantity(fill.side, fill.fillQuantity);
      const nextQuantity = quantity.plus(deltaQuantity);

      if (quantity.isZero()) {
        quantity = nextQuantity;
        averageEntryPrice = nextQuantity.isZero()
          ? zeroPrismaDecimal()
          : fill.fillPrice;
        continue;
      }

      if (isSameDirection(quantity, deltaQuantity)) {
        const currentAbsQuantity = absolute(quantity);
        const deltaAbsQuantity = absolute(deltaQuantity);
        const nextAbsQuantity = absolute(nextQuantity);

        averageEntryPrice = currentAbsQuantity
          .mul(averageEntryPrice)
          .plus(deltaAbsQuantity.mul(fill.fillPrice))
          .div(nextAbsQuantity);
        quantity = nextQuantity;
        continue;
      }

      if (nextQuantity.isZero()) {
        quantity = zeroPrismaDecimal();
        averageEntryPrice = zeroPrismaDecimal();
        continue;
      }

      if (absolute(nextQuantity).lt(absolute(quantity))) {
        quantity = nextQuantity;
        continue;
      }

      quantity = nextQuantity;
      averageEntryPrice = fill.fillPrice;
    }

    const exposureNotional = quantity.isZero()
      ? zeroPrismaDecimal()
      : absolute(quantity).mul(averageEntryPrice);

    return {
      quantity,
      averageEntryPrice,
      exposureNotional,
    };
  }
}
