import {
  ValidationError,
  ValidationPipe,
  ValidationPipeOptions,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import { GrpcStatusCode } from '../const/grpc-status-code.enum';

const flattenValidationErrors = (
  errors: ValidationError[],
  parentPath = '',
): string[] =>
  errors.flatMap((error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const constraints = Object.values(error.constraints ?? {}).map(
      (message) => `${path}: ${message}`,
    );

    return [
      ...constraints,
      ...flattenValidationErrors(error.children ?? [], path),
    ];
  });

const createGrpcValidationException = (
  errors: ValidationError[],
): RpcException => {
  const details = flattenValidationErrors(errors).join('; ');

  return new RpcException({
    code: GrpcStatusCode.INVALID_ARGUMENT,
    message: 'Validation failed',
    details: details || 'Validation failed',
  });
};

export const grpcValidationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validateCustomDecorators: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
  forbidUnknownValues: true,
  exceptionFactory: createGrpcValidationException,
};

export function createGrpcValidationPipe(
  options: ValidationPipeOptions = {},
): ValidationPipe {
  return new ValidationPipe({
    ...grpcValidationPipeOptions,
    ...options,
    transformOptions: {
      ...grpcValidationPipeOptions.transformOptions,
      ...options.transformOptions,
    },
    exceptionFactory:
      options.exceptionFactory ?? grpcValidationPipeOptions.exceptionFactory,
  });
}
