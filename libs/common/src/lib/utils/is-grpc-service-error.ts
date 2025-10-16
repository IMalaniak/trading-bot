export interface GrpcServiceError {
  code: number;
  details?: string;
  metadata?: unknown;
}

export function isGrpcServiceError(err: unknown): err is GrpcServiceError {
  if (typeof err !== 'object' || err === null) return false;
  const maybe = err as Record<string, unknown>;
  return typeof maybe['code'] === 'number';
}
