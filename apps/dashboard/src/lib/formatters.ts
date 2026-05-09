import type { OrderStatusName, SignalSideName } from './portfolio-api';

export const formatDecimal = (
  value: string | number | undefined,
  maximumFractionDigits = 8,
): string => {
  if (value === undefined || value === '') {
    return '-';
  }

  const numericValue =
    typeof value === 'number' ? value : Number.parseFloat(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(numericValue);
};

export const formatNotional = (value: string | number | undefined): string =>
  `${formatDecimal(value, 2)} USDT`;

export const formatDateTime = (value: string | undefined): string => {
  if (!value) {
    return 'No updates yet';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const exposureUsagePercent = (
  aggregateExposureNotional: string,
  exposureCapNotional: string,
): number => {
  const aggregate = Number.parseFloat(aggregateExposureNotional);
  const cap = Number.parseFloat(exposureCapNotional);

  if (!Number.isFinite(aggregate) || !Number.isFinite(cap) || cap <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (aggregate / cap) * 100));
};

const toTitleCase = (value: string): string =>
  value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

export const formatOrderStatus = (status: OrderStatusName): string =>
  toTitleCase(status);

export const formatSignalSide = (side: SignalSideName): string =>
  toTitleCase(side);
