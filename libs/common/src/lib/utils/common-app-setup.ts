import { INestMicroservice } from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';

export function commonAppSetup(
  app: NestFastifyApplication | INestMicroservice,
) {
  app.enableShutdownHooks();
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());
}
