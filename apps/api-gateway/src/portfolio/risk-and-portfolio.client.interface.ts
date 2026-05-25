import {
  AssignStrategyToPortfolioRequest,
  AssignStrategyToPortfolioResponse,
  CreateStrategyRequest,
  CreateStrategyResponse,
  GetPortfolioRequest,
  GetPortfolioResponse,
  GetStrategyRequest,
  GetStrategyResponse,
  ListInstrumentsRequest,
  ListInstrumentsResponse,
  ListPortfoliosRequest,
  ListPortfoliosResponse,
  ListRiskConfigAuditLogRequest,
  ListRiskConfigAuditLogResponse,
  ListRiskDecisionsRequest,
  ListRiskDecisionsResponse,
  ListStrategiesRequest,
  ListStrategiesResponse,
  RegisterPortfolioInstrumentRequest,
  RegisterPortfolioInstrumentResponse,
  UpdatePortfolioInstrumentConfigRequest,
  UpdatePortfolioInstrumentConfigResponse,
  UpdatePortfolioRequest,
  UpdatePortfolioResponse,
  UpdateStrategyRequest,
  UpdateStrategyResponse,
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

  createStrategy(
    data: CreateStrategyRequest,
  ): Observable<CreateStrategyResponse>;

  updateStrategy(
    data: UpdateStrategyRequest,
  ): Observable<UpdateStrategyResponse>;

  getStrategy(data: GetStrategyRequest): Observable<GetStrategyResponse>;

  listStrategies(
    data: ListStrategiesRequest,
  ): Observable<ListStrategiesResponse>;

  assignStrategyToPortfolio(
    data: AssignStrategyToPortfolioRequest,
  ): Observable<AssignStrategyToPortfolioResponse>;
}
