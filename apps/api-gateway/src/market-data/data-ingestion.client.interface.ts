import {
  GetMarketDataBarsRequest,
  GetMarketDataBarsResponse,
} from '@trading-bot/common/proto';
import { Observable } from 'rxjs';

export interface IDataIngestion {
  getMarketDataBars(
    data: GetMarketDataBarsRequest,
  ): Observable<GetMarketDataBarsResponse>;
}
