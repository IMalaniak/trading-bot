import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  PORTFOLIO_MANAGER_CLIENT,
  PORTFOLIO_MANAGER_PROTO,
  PROTO_FOLDER,
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
    ]),
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
