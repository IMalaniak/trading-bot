import { Injectable } from '@nestjs/common';
import { Instrument as PrismaInstrument } from '@prisma/client';

import { Instrument } from '../../types/common/instrument';

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
