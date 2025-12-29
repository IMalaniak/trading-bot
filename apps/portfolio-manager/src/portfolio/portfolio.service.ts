import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka, RpcException } from '@nestjs/microservices';
import { GrpcStatusCode } from '@trading-bot/common';
import {
  Instrument,
  RegisterInstrumentRequest,
  RegisterInstrumentResponse,
} from '@trading-bot/common/proto';
import { lastValueFrom } from 'rxjs';

import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { PORTFOLIO_KAFKA_CLIENT } from './constants';
import { InstrumentMapper } from './mapper/instrument.mapper';

@Injectable()
export class PortfolioService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PORTFOLIO_KAFKA_CLIENT)
    private readonly kafkaClient: ClientKafka,
    private readonly instrumentMapper: InstrumentMapper,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
  }

  async onModuleDestroy() {
    await this.kafkaClient.close();
  }

  async registerInstrument(
    data: RegisterInstrumentRequest,
  ): Promise<RegisterInstrumentResponse> {
    const instrument = await this.prisma.instrument
      .create({
        data: {
          symbol: data.symbol,
          assetClass: data.assetClass,
          venue: data.venue,
          externalSymbol: data.externalSymbol,
        },
      })
      .catch((error) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') {
            throw new RpcException({
              message: 'Instrument already exists',
              code: GrpcStatusCode.ALREADY_EXISTS,
            });
          }
        }
        throw error;
      });

    const kafkaPayload = Instrument.fromPartial({
      id: instrument.id,
      symbol: instrument.symbol,
      assetClass: instrument.assetClass,
      venue: instrument.venue,
      ...(instrument.externalSymbol && {
        externalSymbol: instrument.externalSymbol,
      }),
    });

    await this.emitEvent('portfolio.instrument.created', {
      key: String(instrument.id),
      value: Instrument.encode(kafkaPayload).finish(),
      headers: {
        'content-type': 'application/x-protobuf',
      },
    });

    return { instrument: this.instrumentMapper.map(instrument) };
  }

  // TODO: use a transactional outbox + dispatcher (or CDC) for guaranteed delivery; keep your current best‑effort retry+logging only as a short-term/measured fallback.
  private async emitEvent(
    topic: string,
    message: {
      key: string;
      value: Uint8Array;
      headers?: Record<string, string>;
    },
    attempts = 3,
  ): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await lastValueFrom(this.kafkaClient.emit(topic, message));
        return;
      } catch (err) {
        this.logger.warn(
          `Failed to emit Kafka event '${topic}' (attempt ${attempt}/${attempts})`,
          (err as Error)?.message ?? err,
        );
        if (attempt < attempts) {
          // simple backoff
          await new Promise((res) => setTimeout(res, 50 * attempt));
        } else {
          this.logger.error(
            `Giving up emitting Kafka event '${topic}' after ${attempts} attempts`,
            err as Error,
          );
        }
      }
    }
  }
}
