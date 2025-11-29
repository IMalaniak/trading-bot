import { Injectable } from '@nestjs/common';
import { Instrument } from '@trading-bot/common/proto';

import { InstrumentModel as PrismaInstrument } from '../../prisma/generated/models';

@Injectable()
export class InstrumentMapper {
  public map(source: PrismaInstrument): Instrument {
    return {
      id: source.id,
      symbol: source.symbol,
      assetClass: source.assetClass,
      venue: source.venue,
      externalSymbol: source.externalSymbol ?? undefined,
    };
  }
}
