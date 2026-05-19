import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  PREDICTION_ENGINE_CLIENT,
  PREDICTION_ENGINE_PROTO,
  PROTO_FOLDER,
  PROTOBUF_SERVICES_PREDICTION_ENGINE_PACKAGE,
} from '@trading-bot/common/proto';
import { join } from 'path';

import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: PREDICTION_ENGINE_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: PROTOBUF_SERVICES_PREDICTION_ENGINE_PACKAGE,
            protoPath: join(process.cwd(), PREDICTION_ENGINE_PROTO),
            url: config.getOrThrow<string>('PREDICTION_ENGINE_GRPC_URL'),
            loader: {
              includeDirs: [join(process.cwd(), PROTO_FOLDER)],
              defaults: true,
              longs: Number,
            },
          },
        }),
      },
    ]),
  ],
  controllers: [SignalsController],
  providers: [SignalsService],
})
export class SignalsModule {}
