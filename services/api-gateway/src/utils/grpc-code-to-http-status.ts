import { HttpStatus } from '@nestjs/common';
import { GrpcStatusCode } from 'src/grpc/grpc-status-code.enum';

export function grpcCodeToHttpStatus(code?: GrpcStatusCode): HttpStatus {
  switch (code) {
    case GrpcStatusCode.OK:
      return HttpStatus.OK;
    case GrpcStatusCode.UNKNOWN:
      return HttpStatus.INTERNAL_SERVER_ERROR;
    case GrpcStatusCode.INVALID_ARGUMENT:
      return HttpStatus.BAD_REQUEST;
    case GrpcStatusCode.DEADLINE_EXCEEDED:
      return HttpStatus.GATEWAY_TIMEOUT;
    case GrpcStatusCode.NOT_FOUND:
      return HttpStatus.NOT_FOUND;
    case GrpcStatusCode.ALREADY_EXISTS:
      return HttpStatus.CONFLICT;
    case GrpcStatusCode.PERMISSION_DENIED:
      return HttpStatus.FORBIDDEN;
    case GrpcStatusCode.UNAUTHENTICATED:
      return HttpStatus.UNAUTHORIZED;
    case GrpcStatusCode.RESOURCE_EXHAUSTED:
      return HttpStatus.TOO_MANY_REQUESTS;
    case GrpcStatusCode.FAILED_PRECONDITION:
      return HttpStatus.BAD_REQUEST;
    case GrpcStatusCode.ABORTED:
      return HttpStatus.CONFLICT;
    case GrpcStatusCode.OUT_OF_RANGE:
      return HttpStatus.BAD_REQUEST;
    case GrpcStatusCode.UNIMPLEMENTED:
      return HttpStatus.NOT_IMPLEMENTED;
    case GrpcStatusCode.INTERNAL:
      return HttpStatus.INTERNAL_SERVER_ERROR;
    case GrpcStatusCode.UNAVAILABLE:
      return HttpStatus.SERVICE_UNAVAILABLE;
    case GrpcStatusCode.DATA_LOSS:
      return HttpStatus.INTERNAL_SERVER_ERROR;
    default:
      return HttpStatus.BAD_GATEWAY;
  }
}
