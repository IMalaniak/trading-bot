import { SignalSide } from '@trading-bot/common/proto';

import { toPrismaDecimal } from '../../prisma/prisma-decimal';
import { PositionAccountingFill } from '../types/fill-reconciliation-types';
import { PositionAccountingService } from './position-accounting.service';

describe('PositionAccountingService', () => {
  const service = new PositionAccountingService();

  const fill = (
    overrides: Partial<PositionAccountingFill>,
  ): PositionAccountingFill => ({
    id: 'fill-1',
    side: SignalSide.BUY,
    sequence: 1,
    fillQuantity: toPrismaDecimal('1'),
    fillPrice: toPrismaDecimal('100'),
    filledAt: new Date('2026-03-25T12:00:00.000Z'),
    ...overrides,
  });

  it('opens a long position from a buy fill', () => {
    const position = service.calculate([fill({})]);

    expect(position.quantity.toString()).toBe('1');
    expect(position.averageEntryPrice.toString()).toBe('100');
    expect(position.exposureNotional.toString()).toBe('100');
  });

  it('opens a short position from a sell fill', () => {
    const position = service.calculate([
      fill({ side: SignalSide.SELL, fillQuantity: toPrismaDecimal('2') }),
    ]);

    expect(position.quantity.toString()).toBe('-2');
    expect(position.averageEntryPrice.toString()).toBe('100');
    expect(position.exposureNotional.toString()).toBe('200');
  });

  it('weighted-averages same-direction fills by absolute quantity', () => {
    const position = service.calculate([
      fill({
        id: 'fill-1',
        fillQuantity: toPrismaDecimal('1'),
        fillPrice: toPrismaDecimal('100'),
      }),
      fill({
        id: 'fill-2',
        sequence: 2,
        fillQuantity: toPrismaDecimal('3'),
        fillPrice: toPrismaDecimal('200'),
        filledAt: new Date('2026-03-25T12:00:01.000Z'),
      }),
    ]);

    expect(position.quantity.toString()).toBe('4');
    expect(position.averageEntryPrice.toString()).toBe('175');
    expect(position.exposureNotional.toString()).toBe('700');
  });

  it('keeps average price when reducing a position', () => {
    const position = service.calculate([
      fill({
        id: 'fill-1',
        fillQuantity: toPrismaDecimal('5'),
        fillPrice: toPrismaDecimal('100'),
      }),
      fill({
        id: 'fill-2',
        side: SignalSide.SELL,
        sequence: 2,
        fillQuantity: toPrismaDecimal('2'),
        fillPrice: toPrismaDecimal('150'),
        filledAt: new Date('2026-03-25T12:00:01.000Z'),
      }),
    ]);

    expect(position.quantity.toString()).toBe('3');
    expect(position.averageEntryPrice.toString()).toBe('100');
    expect(position.exposureNotional.toString()).toBe('300');
  });

  it('uses crossing fill price for the reversed remainder', () => {
    const position = service.calculate([
      fill({
        id: 'fill-1',
        fillQuantity: toPrismaDecimal('2'),
        fillPrice: toPrismaDecimal('100'),
      }),
      fill({
        id: 'fill-2',
        side: SignalSide.SELL,
        sequence: 2,
        fillQuantity: toPrismaDecimal('5'),
        fillPrice: toPrismaDecimal('150'),
        filledAt: new Date('2026-03-25T12:00:01.000Z'),
      }),
    ]);

    expect(position.quantity.toString()).toBe('-3');
    expect(position.averageEntryPrice.toString()).toBe('150');
    expect(position.exposureNotional.toString()).toBe('450');
  });

  it('sets price and exposure to zero when flat', () => {
    const position = service.calculate([
      fill({
        id: 'fill-1',
        fillQuantity: toPrismaDecimal('2'),
        fillPrice: toPrismaDecimal('100'),
      }),
      fill({
        id: 'fill-2',
        side: SignalSide.SELL,
        sequence: 2,
        fillQuantity: toPrismaDecimal('2'),
        fillPrice: toPrismaDecimal('150'),
        filledAt: new Date('2026-03-25T12:00:01.000Z'),
      }),
    ]);

    expect(position.quantity.toString()).toBe('0');
    expect(position.averageEntryPrice.toString()).toBe('0');
    expect(position.exposureNotional.toString()).toBe('0');
  });

  it('sorts fills before calculating so replay order converges', () => {
    const position = service.calculate([
      fill({
        id: 'fill-2',
        sequence: 2,
        fillQuantity: toPrismaDecimal('3'),
        fillPrice: toPrismaDecimal('200'),
        filledAt: new Date('2026-03-25T12:00:01.000Z'),
      }),
      fill({
        id: 'fill-1',
        fillQuantity: toPrismaDecimal('1'),
        fillPrice: toPrismaDecimal('100'),
      }),
    ]);

    expect(position.quantity.toString()).toBe('4');
    expect(position.averageEntryPrice.toString()).toBe('175');
    expect(position.exposureNotional.toString()).toBe('700');
  });
});
