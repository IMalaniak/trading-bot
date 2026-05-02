import { join } from 'node:path';

import { Module } from '@nestjs/common';
import { CommonModule } from '@trading-bot/common';

import { portfolioManagerRuntimeConfig } from './config/runtime.config';
import { validate } from './env.validation';
import { PortfolioModule } from './portfolio/portfolio.module';
import { RiskPipelineModule } from './risk-pipeline/risk-pipeline.module';

const rootEnvPath = join(process.cwd(), '.env');
const appEnvPath = join(__dirname, '../.env');

@Module({
  imports: [
    CommonModule.forRoot({
      config: {
        envFilePath: [rootEnvPath, appEnvPath],
        load: [portfolioManagerRuntimeConfig],
        validate,
      },
    }),
    PortfolioModule,
    RiskPipelineModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
