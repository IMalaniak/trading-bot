import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  EXECUTION_ENGINE_CLIENT,
  EXECUTION_ENGINE_PROTO,
  PORTFOLIO_MANAGER_CLIENT,
  PORTFOLIO_MANAGER_PROTO,
  PROTO_FOLDER,
  PROTOBUF_SERVICES_EXECUTION_ENGINE_PACKAGE,
  PROTOBUF_SERVICES_PORTFOLIO_MANAGER_PACKAGE,
} from '@trading-bot/common/proto';
import { join } from 'path';

import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: PORTFOLIO_MANAGER_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: PROTOBUF_SERVICES_PORTFOLIO_MANAGER_PACKAGE,
            protoPath: join(process.cwd(), PORTFOLIO_MANAGER_PROTO),
            url: config.getOrThrow<string>('PORTFOLIO_MANAGER_GRPC_URL'),
            loader: {
              includeDirs: [join(process.cwd(), PROTO_FOLDER)],
            },
          },
        }),
      },
      {
        name: EXECUTION_ENGINE_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: PROTOBUF_SERVICES_EXECUTION_ENGINE_PACKAGE,
            protoPath: join(process.cwd(), EXECUTION_ENGINE_PROTO),
            url: config.getOrThrow<string>('EXECUTION_ENGINE_GRPC_URL'),
            loader: {
              includeDirs: [join(process.cwd(), PROTO_FOLDER)],
            },
          },
        }),
      },
    ]),
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
