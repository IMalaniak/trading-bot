import {
  RegisterInstrumentRequest,
  RegisterInstrumentResponse,
} from '@trading-bot/common/proto';
import { Observable } from 'rxjs';

export interface IRiskAndPortfolioManager {
  registerInstrument(
    data: RegisterInstrumentRequest,
  ): Observable<RegisterInstrumentResponse>;
}
