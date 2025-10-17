import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '@trading-bot/common';
import { join } from 'path';

import { validate } from './env.validation';
import { PortfolioModule } from './portfolio/portfolio.module';

@Module({
  imports: [
    CommonModule,
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      envFilePath: [join(__dirname, '../../../.env')],
      validate,
    }),
    PortfolioModule,
  ],
})
export class AppModule {}
