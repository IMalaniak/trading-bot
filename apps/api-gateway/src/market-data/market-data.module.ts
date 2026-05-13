import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  DATA_INGESTION_CLIENT,
  DATA_INGESTION_PROTO,
  PROTO_FOLDER,
  PROTOBUF_SERVICES_DATA_INGESTION_PACKAGE,
} from '@trading-bot/common/proto';
import { join } from 'path';

import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: DATA_INGESTION_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: PROTOBUF_SERVICES_DATA_INGESTION_PACKAGE,
            protoPath: join(process.cwd(), DATA_INGESTION_PROTO),
            url: config.getOrThrow<string>('DATA_INGESTION_GRPC_URL'),
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
  controllers: [MarketDataController],
  providers: [MarketDataService],
})
export class MarketDataModule {}
