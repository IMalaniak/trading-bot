import {
  GetPortfolioRequest,
  GetPortfolioResponse,
  ListInstrumentsRequest,
  ListInstrumentsResponse,
  ListPortfoliosRequest,
  ListPortfoliosResponse,
  RegisterPortfolioInstrumentRequest,
  RegisterPortfolioInstrumentResponse,
} from '@trading-bot/common/proto';
import { Observable } from 'rxjs';

export interface IRiskAndPortfolioManager {
  registerPortfolioInstrument(
    data: RegisterPortfolioInstrumentRequest,
  ): Observable<RegisterPortfolioInstrumentResponse>;

  listPortfolios(
    data: ListPortfoliosRequest,
  ): Observable<ListPortfoliosResponse>;

  getPortfolio(data: GetPortfolioRequest): Observable<GetPortfolioResponse>;

  listInstruments(
    data: ListInstrumentsRequest,
  ): Observable<ListInstrumentsResponse>;
}
