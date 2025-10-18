import { join } from 'node:path';

import { Module } from '@nestjs/common';
import { CommonModule } from '@trading-bot/common';

import { validate } from './env.validation';
import { PortfolioModule } from './portfolio/portfolio.module';

const rootEnvPath = join(process.cwd(), '.env');
const appEnvPath = join(__dirname, '../.env');

@Module({
  imports: [
    CommonModule.forRoot({
      config: {
        envFilePath: [rootEnvPath, appEnvPath],
        validate,
      },
    }),
    PortfolioModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
