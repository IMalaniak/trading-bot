import {
  GetLatestSignalsRequest,
  GetLatestSignalsResponse,
} from '@trading-bot/common/proto';
import { Observable } from 'rxjs';

export interface IPredictionEngineSignals {
  getLatestSignals(
    data: GetLatestSignalsRequest,
  ): Observable<GetLatestSignalsResponse>;
}
