import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';

import { PrismaModule } from '../prisma/prisma.module';
import { EXECUTION_ENGINE_KAFKA_CLIENT } from './const';
import { EventDispatcherService } from './event-dispatcher.service';
import { OutboxRepository } from './outbox.repository';

export const createEventDispatcherKafkaClientOptions = (
  configService: ConfigService,
) => {
  const brokers = configService
    .getOrThrow<string>('KAFKA_BROKERS')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);

  return {
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'execution-engine',
        brokers,
        requestTimeout: 25000,
        enforceRequestTimeout: false,
      },
      producer: {
        createPartitioner: Partitioners.DefaultPartitioner,
      },
      producerOnlyMode: true,
    },
  } as const;
};

@Module({
  imports: [
    PrismaModule,
    ClientsModule.registerAsync([
      {
        name: EXECUTION_ENGINE_KAFKA_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: createEventDispatcherKafkaClientOptions,
      },
    ]),
  ],
  providers: [EventDispatcherService, OutboxRepository],
  exports: [EventDispatcherService],
})
export class EventDispatcherModule {}
