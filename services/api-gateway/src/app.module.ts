import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GrpcClientsModule } from './grpc/grpc.module';

@Module({
  imports: [GrpcClientsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
