import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { TradeSizingService } from './trade-sizing.service';

describe('TradeSizingService', () => {
  const service = new TradeSizingService();

  it('derives quantity from target notional and reference price', () => {
    const trade = service.sizeTrade(
      toPrismaDecimal('250'),
      toPrismaDecimal('50'),
    );

    expect(trade.requestedNotional.toString()).toBe('250');
    expect(trade.requestedQuantity.toString()).toBe('5');
    expect(trade.referencePrice.toString()).toBe('50');
  });

  it('throws when reference price is not positive', () => {
    expect(() =>
      service.sizeTrade(toPrismaDecimal('100'), toPrismaDecimal('0')),
    ).toThrow('referencePrice must be greater than zero');
  });
});
