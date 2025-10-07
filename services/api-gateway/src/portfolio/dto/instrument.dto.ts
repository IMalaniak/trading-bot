import { AssetClass, Instrument } from 'src/types/common/instrument';

export class InstrumentDto implements Instrument {
  instrumentId: string;
  symbol: string;
  assetClass: AssetClass;
  venue: string;
  externalSymbol: string;
}
