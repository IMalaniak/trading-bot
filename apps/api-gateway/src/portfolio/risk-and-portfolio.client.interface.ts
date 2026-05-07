import {
  GetPortfolioRequest,
  GetPortfolioResponse,
  ListInstrumentsRequest,
  ListInstrumentsResponse,
  RegisterInstrumentRequest,
  RegisterInstrumentResponse,
} from '@trading-bot/common/proto';
import { Observable } from 'rxjs';

export interface IRiskAndPortfolioManager {
  registerInstrument(
    data: RegisterInstrumentRequest,
  ): Observable<RegisterInstrumentResponse>;

  getPortfolio(data: GetPortfolioRequest): Observable<GetPortfolioResponse>;

  listInstruments(
    data: ListInstrumentsRequest,
  ): Observable<ListInstrumentsResponse>;
}
