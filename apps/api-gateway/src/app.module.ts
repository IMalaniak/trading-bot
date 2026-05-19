import { Module } from '@nestjs/common';
import { CommonModule, TradingBotMetricsModule } from '@trading-bot/common';
import { join } from 'path';

import { validate } from './env.validation';
import { MarketDataModule } from './market-data/market-data.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { SignalsModule } from './signals/signals.module';

const rootEnvPath = join(process.cwd(), '.env');
const appEnvPath = join(process.cwd(), 'apps/api-gateway/.env');

@Module({
  imports: [
    CommonModule.forRoot({
      config: {
        envFilePath: [rootEnvPath, appEnvPath],
        validate,
      },
    }),
    TradingBotMetricsModule.forRoot('api-gateway'),
    PortfolioModule,
    MarketDataModule,
    SignalsModule,
  ],
})
export class AppModule {}
