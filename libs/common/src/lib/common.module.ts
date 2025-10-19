import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigModuleOptions } from '@nestjs/config';
import { LoggerModule, Params as NestjsPinoParams } from 'nestjs-pino';

import { NodeEnvironment } from './const';

export interface CommonModuleOptions {
  /** Options passed to nestjs-pino LoggerModule.forRoot */
  logger?: NestjsPinoParams;
  /** Options passed to @nestjs/config ConfigModule.forRoot */
  config?: ConfigModuleOptions;
}

@Module({})
export class CommonModule {
  static forRoot(options?: CommonModuleOptions): DynamicModule {
    const defaultPinoHttp = {
      level:
        process.env['NODE_ENV'] !== NodeEnvironment.Production
          ? 'debug'
          : 'info',
      transport:
        process.env['NODE_ENV'] !== NodeEnvironment.Production
          ? { target: 'pino-pretty' }
          : undefined,
    };

    const callerLogger = options?.logger ?? {};
    const callerPinoHttp = callerLogger.pinoHttp;

    const loggerOptions: NestjsPinoParams = {
      ...callerLogger,
      pinoHttp: {
        ...defaultPinoHttp,
        ...(callerPinoHttp || {}),
      },
    };

    const configOptions: ConfigModuleOptions = {
      isGlobal: true,
      expandVariables: true,
      ...(options?.config || {}),
    };

    return {
      module: CommonModule,
      imports: [
        LoggerModule.forRoot(loggerOptions),
        ConfigModule.forRoot(configOptions),
      ],
      exports: [ConfigModule, LoggerModule],
    };
  }
}
