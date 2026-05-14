import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';

import { EXTERNAL_API_FACADE_KAFKA_CLIENT } from './const';
import { ExternalApiFacadeController } from './external-api-facade.controller';
import { FacadeService } from './facade.service';

@Module({
  controllers: [ExternalApiFacadeController],
  providers: [
    FacadeService,
    {
      provide: EXTERNAL_API_FACADE_KAFKA_CLIENT,
      useFactory: (configService: ConfigService) => {
        const brokers = configService
          .getOrThrow<string>('KAFKA_BROKERS')
          .split(',')
          .map((b) => b.trim());
        return ClientProxyFactory.create({
          transport: Transport.KAFKA,
          options: {
            client: { brokers },
            producer: {},
          },
        });
      },
      inject: [ConfigService],
    },
  ],
})
export class FacadeModule {}
