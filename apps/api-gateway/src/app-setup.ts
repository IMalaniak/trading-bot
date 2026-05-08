import {
  RequestMethod,
  ValidationPipe,
  ValidationPipeOptions,
} from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { commonAppSetup } from '@trading-bot/common';

import { createApiGatewayCorsOptions } from './cors.config';

export const validationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: true,
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
