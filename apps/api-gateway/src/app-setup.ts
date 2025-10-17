import { ValidationPipe, ValidationPipeOptions } from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { commonAppSetup } from '@trading-bot/common';

export const validationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: true,
};

export const setupApp = (app: NestFastifyApplication) => {
  commonAppSetup(app);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
};
