import {
  BadRequestException,
  RequestMethod,
  ValidationError,
  ValidationPipe,
  ValidationPipeOptions,
} from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppResponseCode, commonAppSetup } from '@trading-bot/common';

import { createApiGatewayCorsOptions } from './cors.config';

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

export const validationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: true,
  exceptionFactory: (errors: ValidationError[]) =>
    new BadRequestException({
      message: flattenValidationErrors(errors),
      code: AppResponseCode.VALIDATION_FAILED,
    }),
};

export const setupApp = (app: NestFastifyApplication) => {
  commonAppSetup(app);
  app.enableCors(
    createApiGatewayCorsOptions(process.env.API_GATEWAY_CORS_ORIGINS),
  );
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix, {
    exclude: [{ path: 'metrics', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
};
