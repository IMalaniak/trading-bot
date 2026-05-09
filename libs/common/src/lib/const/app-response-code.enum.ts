export enum AppResponseCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  PORTFOLIO_NOT_FOUND = 'PORTFOLIO_NOT_FOUND',
  INSTRUMENT_ALREADY_ATTACHED = 'INSTRUMENT_ALREADY_ATTACHED',
  INSTRUMENT_METADATA_CONFLICT = 'INSTRUMENT_METADATA_CONFLICT',
  UPSTREAM_TIMEOUT = 'UPSTREAM_TIMEOUT',
  UPSTREAM_UNAVAILABLE = 'UPSTREAM_UNAVAILABLE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export const isAppResponseCode = (value: unknown): value is AppResponseCode =>
  typeof value === 'string' &&
  Object.values(AppResponseCode).includes(value as AppResponseCode);
