import {
  GetPortfolioRequest,
  GetPortfolioResponse,
  ListInstrumentsRequest,
  ListInstrumentsResponse,
  ListPortfoliosRequest,
  ListPortfoliosResponse,
  ListRiskConfigAuditLogRequest,
  ListRiskConfigAuditLogResponse,
  ListRiskDecisionsRequest,
  ListRiskDecisionsResponse,
  RegisterPortfolioInstrumentRequest,
  RegisterPortfolioInstrumentResponse,
  UpdatePortfolioInstrumentConfigRequest,
  UpdatePortfolioInstrumentConfigResponse,
  UpdatePortfolioRequest,
  UpdatePortfolioResponse,
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

  updatePortfolio(
    data: UpdatePortfolioRequest,
  ): Observable<UpdatePortfolioResponse>;

  updatePortfolioInstrumentConfig(
    data: UpdatePortfolioInstrumentConfigRequest,
  ): Observable<UpdatePortfolioInstrumentConfigResponse>;

  listRiskDecisions(
    data: ListRiskDecisionsRequest,
  ): Observable<ListRiskDecisionsResponse>;

  listRiskConfigAuditLog(
    data: ListRiskConfigAuditLogRequest,
  ): Observable<ListRiskConfigAuditLogResponse>;
}
