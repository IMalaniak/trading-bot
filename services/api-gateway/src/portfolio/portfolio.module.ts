import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import {
  RISK_AND_PORTFOLIO_CLIENT,
  RISK_AND_PORTFOLIO_PACKAGE,
  RISK_AND_PORTFOLIO_PROTO,
} from 'src/grpc/grpc.constants';

import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: RISK_AND_PORTFOLIO_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: RISK_AND_PORTFOLIO_PACKAGE,
            protoPath: join(process.cwd(), RISK_AND_PORTFOLIO_PROTO),
            url: config.getOrThrow<string>('RISK_PORTFOLIO_GRPC_URL'),
            loader: {
              includeDirs: [join(process.cwd(), '../../proto')],
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
