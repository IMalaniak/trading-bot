import { AppResponseCode } from '../const/app-response-code.enum';
import { GrpcStatusCode } from '../const/grpc-status-code.enum';

export interface GrpcServiceError {
  code: GrpcStatusCode;
  details?: string;
  message?: string;
  appCode?: AppResponseCode | string;
  metadata?: unknown;
}

export function isGrpcServiceError(err: unknown): err is GrpcServiceError {
  if (typeof err !== 'object' || err === null) return false;
  const maybe = err as Record<string, unknown>;
  return typeof maybe['code'] === 'number';
}
