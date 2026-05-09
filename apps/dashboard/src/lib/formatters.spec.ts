import { describe, expect, it } from 'vitest';

import {
  exposureUsagePercent,
  formatDateTime,
  formatDecimal,
  formatNotional,
  formatOrderStatus,
  formatSignalSide,
} from './formatters';

describe('dashboard formatters', () => {
  it('formats decimal strings without losing labels for invalid values', () => {
    expect(formatDecimal('1500.2500', 2)).toBe('1,500.25');
    expect(formatDecimal('not-a-number')).toBe('not-a-number');
    expect(formatDecimal(undefined)).toBe('-');
  });

  it('formats notional values as USDT', () => {
    expect(formatNotional('1000')).toBe('1,000 USDT');
  });

  it('formats timestamps and preserves invalid strings', () => {
    expect(formatDateTime(undefined)).toBe('No updates yet');
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
  });

  it('calculates capped exposure usage', () => {
    expect(exposureUsagePercent('150', '1000')).toBe(15);
    expect(exposureUsagePercent('1200', '1000')).toBe(100);
    expect(exposureUsagePercent('100', '0')).toBe(0);
  });

  it('formats snake case order statuses', () => {
    expect(formatOrderStatus('partially_filled')).toBe('Partially Filled');
  });

  it('formats signal sides', () => {
    expect(formatSignalSide('buy')).toBe('Buy');
    expect(formatSignalSide('sell')).toBe('Sell');
    expect(formatSignalSide('hold')).toBe('Hold');
  });
});
