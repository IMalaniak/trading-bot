import { Observable } from 'rxjs';
import type {
  RegisterInstrumentRequest,
  RegisterInstrumentResponse,
} from 'src/types/services/risk_manager';

export interface IRiskAndPortfolioManager {
  registerInstrument(
    data: RegisterInstrumentRequest,
  ): Observable<RegisterInstrumentResponse>;
}
