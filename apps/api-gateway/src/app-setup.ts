import { ValidationPipe, ValidationPipeOptions } from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

export const validationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: true,
};

export const setupApp = (app: NestFastifyApplication) => {
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
};
