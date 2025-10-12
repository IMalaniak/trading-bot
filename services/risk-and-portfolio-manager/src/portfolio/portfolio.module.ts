import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { InstrumentMapper } from './mapper/instrument.mapper';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [PrismaModule],
  controllers: [PortfolioController],
  providers: [PortfolioService, InstrumentMapper],
})
export class PortfolioModule {}
