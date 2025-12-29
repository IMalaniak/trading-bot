import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { PrismaModule } from '../prisma/prisma.module';
import { PORTFOLIO_KAFKA_CLIENT } from './constants';
import { InstrumentMapper } from './mapper/instrument.mapper';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.registerAsync([
      {
        name: PORTFOLIO_KAFKA_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const brokers = configService
            .getOrThrow<string>('KAFKA_BROKERS')
            .split(',')
            .map((broker) => broker.trim())
            .filter(Boolean);

          return {
            transport: Transport.KAFKA,
            options: {
              client: {
                clientId: 'portfolio-manager',
                brokers,
              },
              producerOnlyMode: true,
            },
          };
        },
      },
    ]),
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService, InstrumentMapper],
})
export class PortfolioModule {}
