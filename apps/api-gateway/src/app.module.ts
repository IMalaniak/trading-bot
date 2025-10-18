import { Module } from '@nestjs/common';
import { CommonModule } from '@trading-bot/common';
import { join } from 'path';

import { validate } from './env.validation';
import { PortfolioModule } from './portfolio/portfolio.module';

const rootEnvPath = join(process.cwd(), '.env');

@Module({
  imports: [
    CommonModule.forRoot({
      config: {
        envFilePath: [rootEnvPath],
        validate,
      },
    }),
    PortfolioModule,
  ],
})
export class AppModule {}
