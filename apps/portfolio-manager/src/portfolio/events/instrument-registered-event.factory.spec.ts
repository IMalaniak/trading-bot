import {
  instrumentKey,
  KAFKA_EVENT_HEADER_NAMES,
  KAFKA_EVENT_PRODUCERS,
  KAFKA_EVENT_SCHEMA_VERSIONS,
  KAFKA_TOPICS,
} from '@trading-bot/common';
import { AssetClass, InstrumentRegistered } from '@trading-bot/common/proto';

import { InstrumentModel as PrismaInstrument } from '../../prisma/generated/models';
import { InstrumentMapper } from '../mapper/instrument.mapper';
import { InstrumentRegisteredEventFactory } from './instrument-registered-event.factory';

describe('InstrumentRegisteredEventFactory', () => {
  let factory: InstrumentRegisteredEventFactory;

  const instrument = {
    id: 'instrument-1',
    assetClass: AssetClass.CRYPTO,
    symbol: 'BTC/USDT',
    venue: 'binance',
    externalSymbol: 'BTCUSDT',
  } as PrismaInstrument;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-22T12:34:56.789Z'));
    factory = new InstrumentRegisteredEventFactory(new InstrumentMapper());
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('builds a registration event with shared topic, key, payload, and headers', () => {
    const event = factory.create(instrument);
    const payload = InstrumentRegistered.decode(event.message.value);

    expect(event.topic).toBe(KAFKA_TOPICS.INSTRUMENT_REGISTERED);
    expect(event.message.eventId).toEqual(expect.any(String));
    expect(event.message.key).toBe(
      instrumentKey(instrument.venue, instrument.id),
    );
    expect(event.message.headers).toEqual({
      [KAFKA_EVENT_HEADER_NAMES.EVENT_ID]: event.message.eventId as string,
      [KAFKA_EVENT_HEADER_NAMES.EVENT_TYPE]: KAFKA_TOPICS.INSTRUMENT_REGISTERED,
      [KAFKA_EVENT_HEADER_NAMES.SCHEMA_VERSION]:
        KAFKA_EVENT_SCHEMA_VERSIONS.INSTRUMENT_REGISTERED,
      [KAFKA_EVENT_HEADER_NAMES.OCCURRED_AT]: '2026-03-22T12:34:56.789Z',
      [KAFKA_EVENT_HEADER_NAMES.PRODUCER]:
        KAFKA_EVENT_PRODUCERS.PORTFOLIO_MANAGER,
      [KAFKA_EVENT_HEADER_NAMES.CONTENT_TYPE]: 'application/x-protobuf',
    });
    expect(payload).toEqual({
      instrument: {
        id: instrument.id,
        assetClass: instrument.assetClass,
        symbol: instrument.symbol,
        venue: instrument.venue,
        externalSymbol: instrument.externalSymbol,
      },
      registeredAt: '2026-03-22T12:34:56.789Z',
    });
  });
});
