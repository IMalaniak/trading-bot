import { URLS } from './e2e-env';

export type SignalSideName = 'BUY' | 'SELL' | 'SIGNAL_SIDE_UNSPECIFIED';
export type AssetClassName = 'crypto' | 'stock' | 'unspecified';
export type OrderStatusName =
  | 'FILLED'
  | 'ORDER_STATUS_UNSPECIFIED'
  | 'PARTIALLY_FILLED'
  | 'PLACED';

export interface InstrumentDto {
  assetClass: string;
  externalSymbol?: string;
  id: string;
  symbol: string;
  venue: string;
}

export interface PortfolioSummaryDto {
  aggregateExposureNotional: string;
  exposureCapNotional: string;
  isActive: boolean;
  name: string;
  openPositionCount: number;
  portfolioId: string;
  updatedAt: string;
}

export interface PortfolioPositionDto {
  averageEntryPrice: string;
  exposureNotional: string;
  instrument: InstrumentDto;
  lastFillId: string;
  portfolioId: string;
  quantity: string;
  updatedAt: string;
}

export interface ExecutionFillDto {
  cumulativeFilledNotional: string;
  cumulativeFilledQuantity: string;
  fillId: string;
  fillNotional: string;
  fillPrice: string;
  fillQuantity: string;
  filledAt: string;
  instrumentId: string;
  orderId: string;
  orderStatus: OrderStatusName;
  portfolioId: string;
  sequence: number;
}

export interface ExecutionOrderDto {
  approvalEventId: string;
  approvedAt: string;
  candidateIdempotencyKey: string;
  fills: ExecutionFillDto[];
  instrument?: InstrumentDto;
  instrumentId: string;
  lastActivityAt: string;
  orderId: string;
  placedAt: string;
  portfolioId: string;
  referencePrice: string;
  requestedNotional: string;
  requestedQuantity: string;
  side: SignalSideName;
  signalId: string;
  sourceEventId: string;
  status: OrderStatusName;
}

export interface PortfolioReadResponseDto {
  positions: PortfolioPositionDto[];
  recentOrders: ExecutionOrderDto[];
  summary: PortfolioSummaryDto;
  configuredInstruments: PortfolioInstrumentConfigDto[];
}

export interface ListPortfoliosResponseDto {
  portfolios: PortfolioSummaryDto[];
}

export interface MarketDataBarDto {
  closeTimeMs: number;
  instrumentId: string;
  interval: string;
  close: string;
  high: string;
  low: string;
  open: string;
  openTimeMs: number;
  quoteVolume: string;
  symbol: string;
  tradeCount: number;
  venue: string;
  volume: string;
}

export interface GetMarketDataBarsResponseDto {
  bars: MarketDataBarDto[];
}

export interface SignalDto {
  id: string;
  instrumentId: string;
  side: SignalSideName;
  price: number;
  timestamp: number;
}

export interface GetLatestSignalsResponseDto {
  signals: SignalDto[];
}

export interface GetMarketDataBarsQuery {
  instrumentId: string;
  interval: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface PortfolioInstrumentConfigDto {
  portfolioId: string;
  instrument: InstrumentDto;
  enabled: boolean;
  targetNotional: string;
  maxTradeNotional: string;
  maxPositionNotional: string;
  maxOpenTrades?: number | null;
  maxDailyTurnoverNotional?: string | null;
  cooldownSeconds?: number | null;
  maxConsecutiveRejections?: number | null;
  updatedAt: string;
}

export interface UpdatePortfolioInstrumentConfigRequestDto {
  enabled?: boolean;
  targetNotional?: string;
  maxTradeNotional?: string;
  maxPositionNotional?: string;
  maxOpenTrades?: number | null;
  maxDailyTurnoverNotional?: string | null;
  cooldownSeconds?: number | null;
  maxConsecutiveRejections?: number | null;
}

export interface UpdatePortfolioRequestDto {
  exposureCapNotional?: string;
  isActive?: boolean;
}

export interface RiskDecisionDto {
  decisionId: string;
  portfolioId: string;
  instrumentId: string;
  candidateId: string;
  decision: 'APPROVED' | 'REJECTED';
  reasonCodes: string[];
  decidedAt: string;
}

export interface ListRiskDecisionsResponseDto {
  decisions: RiskDecisionDto[];
  nextCursor?: string;
}

export interface RiskConfigAuditLogEntryDto {
  id: string;
  entityType: string;
  portfolioId: string;
  portfolioInstrumentConfigId?: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  changedAt: string;
}

export interface ListRiskConfigAuditLogResponseDto {
  entries: RiskConfigAuditLogEntryDto[];
  nextCursor?: string;
}

export interface StrategyDto {
  id: string;
  name: string;
  description?: string;
  allowedSides: number[];
  minIntervalSecs?: number;
  activeTimeStart?: string;
  activeTimeEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStrategyRequestDto {
  name: string;
  description?: string;
  allowedSides: number[];
  minIntervalSecs?: number;
  activeTimeStart?: string;
  activeTimeEnd?: string;
}

export interface RegisterPortfolioInstrumentRequestDto {
  symbol: string;
  assetClass: AssetClassName;
  venue: string;
  externalSymbol: string;
  enabled: boolean;
  targetNotional: string;
  maxTradeNotional: string;
  maxPositionNotional: string;
}

export interface AssignStrategyRequestDto {
  strategyId: string | null;
}

const requestJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `GET ${url} failed with ${response.status} ${response.statusText}: ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
};

const mutateJson = async <T>(
  method: 'POST' | 'PATCH' | 'PUT',
  url: string,
  body: unknown,
): Promise<T> => {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `${method} ${url} failed with ${response.status} ${response.statusText}: ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
};

export class ApiClient {
  constructor(private readonly apiBaseUrl = URLS.apiBase) {}

  async listPortfolios(): Promise<ListPortfoliosResponseDto> {
    return await requestJson<ListPortfoliosResponseDto>(
      `${this.apiBaseUrl}/portfolios`,
    );
  }

  async getPortfolio(portfolioId: string): Promise<PortfolioReadResponseDto> {
    return await requestJson<PortfolioReadResponseDto>(
      `${this.apiBaseUrl}/portfolios/${encodeURIComponent(portfolioId)}?recentOrdersLimit=20`,
    );
  }

  async updatePortfolio(
    portfolioId: string,
    payload: UpdatePortfolioRequestDto,
  ): Promise<PortfolioSummaryDto> {
    return await mutateJson<PortfolioSummaryDto>(
      'PATCH',
      `${this.apiBaseUrl}/portfolios/${encodeURIComponent(portfolioId)}`,
      payload,
    );
  }

  async updatePortfolioInstrumentConfig(
    portfolioId: string,
    instrumentId: string,
    payload: UpdatePortfolioInstrumentConfigRequestDto,
  ): Promise<PortfolioInstrumentConfigDto> {
    return await mutateJson<PortfolioInstrumentConfigDto>(
      'PATCH',
      `${this.apiBaseUrl}/portfolios/${encodeURIComponent(portfolioId)}/instrument/${encodeURIComponent(instrumentId)}`,
      payload,
    );
  }

  async registerPortfolioInstrument(
    portfolioId: string,
    payload: RegisterPortfolioInstrumentRequestDto,
  ): Promise<PortfolioInstrumentConfigDto> {
    return await mutateJson<PortfolioInstrumentConfigDto>(
      'POST',
      `${this.apiBaseUrl}/portfolios/${encodeURIComponent(portfolioId)}/instrument`,
      payload,
    );
  }

  async listRiskDecisions(
    portfolioId: string,
    params?: { decision?: 'APPROVED' | 'REJECTED'; limit?: number },
  ): Promise<ListRiskDecisionsResponseDto> {
    const qs = new URLSearchParams();
    if (params?.decision) qs.set('decisionFilter', params.decision);
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return await requestJson<ListRiskDecisionsResponseDto>(
      `${this.apiBaseUrl}/portfolios/${encodeURIComponent(portfolioId)}/decisions${query}`,
    );
  }

  async listRiskConfigAuditLog(
    portfolioId: string,
  ): Promise<ListRiskConfigAuditLogResponseDto> {
    return await requestJson<ListRiskConfigAuditLogResponseDto>(
      `${this.apiBaseUrl}/portfolios/${encodeURIComponent(portfolioId)}/audit`,
    );
  }

  async createStrategy(
    payload: CreateStrategyRequestDto,
  ): Promise<StrategyDto> {
    return await mutateJson<StrategyDto>(
      'POST',
      `${this.apiBaseUrl}/strategies`,
      payload,
    );
  }

  async assignStrategy(
    portfolioId: string,
    payload: AssignStrategyRequestDto,
  ): Promise<void> {
    await mutateJson<unknown>(
      'POST',
      `${this.apiBaseUrl}/portfolios/${encodeURIComponent(portfolioId)}/strategy`,
      payload,
    );
  }

  async getMarketDataBars(
    query: GetMarketDataBarsQuery,
  ): Promise<GetMarketDataBarsResponseDto> {
    const params = new URLSearchParams({
      instrumentId: query.instrumentId,
      interval: query.interval,
    });
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    return await requestJson<GetMarketDataBarsResponseDto>(
      `${this.apiBaseUrl}/market-data/bars?${params.toString()}`,
    );
  }

  async getLatestSignals(limit = 10): Promise<GetLatestSignalsResponseDto> {
    return await requestJson<GetLatestSignalsResponseDto>(
      `${this.apiBaseUrl}/signals?limit=${limit}`,
    );
  }
}
