import { Injectable } from '@nestjs/common';
import {
  buildEventMetadataHeaders,
  instrumentKey,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
} from '@trading-bot/common';
import { InstrumentRegistered } from '@trading-bot/common/proto';
import { randomUUID } from 'crypto';

import { OutboxMessageInput } from '../../event-dispatcher/types/outbox-message';
import { InstrumentModel as PrismaInstrument } from '../../prisma/generated/models';
import { InstrumentMapper } from '../mapper/instrument.mapper';

interface InstrumentRegisteredEvent {
  topic: (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
  message: OutboxMessageInput;
}

@Injectable()
export class InstrumentRegisteredEventFactory {
  constructor(private readonly instrumentMapper: InstrumentMapper) {}

  create(instrument: PrismaInstrument): InstrumentRegisteredEvent {
    const eventId = randomUUID();
    const occurredAt = new Date().toISOString();
    const protoInstrument = this.instrumentMapper.map(instrument);
    const payload = InstrumentRegistered.fromPartial({
      instrument: protoInstrument,
      registeredAt: occurredAt,
    });

    return {
      topic: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
      message: {
        eventId,
        key: instrumentKey(instrument.venue, instrument.id),
        value: InstrumentRegistered.encode(payload).finish(),
        headers: buildEventMetadataHeaders({
          eventId,
          eventType: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
          schemaVersion: KAFKA_EVENT_SCHEMA_VERSIONS.INSTRUMENT_REGISTERED,
          occurredAt,
          producer: KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
        }),
      },
    };
  }
}
