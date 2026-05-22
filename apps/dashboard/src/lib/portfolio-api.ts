export const DEFAULT_API_BASE_URL = 'http://localhost:3000/api';
export const RECENT_ORDERS_LIMIT = 20;
export const RECENT_SIGNALS_LIMIT = 10;

export type AssetClassName = 'unspecified' | 'crypto' | 'stock';
export type SignalSideName =
  | 'SIGNAL_SIDE_UNSPECIFIED'
  | 'BUY'
  | 'SELL'
  | 'buy'
  | 'sell'
  | 'hold';
export type OrderStatusName =
  | 'placed'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'rejected';

export interface InstrumentDto {
  id: string;
  symbol: string;
  assetClass: AssetClassName;
  venue: string;
  externalSymbol?: string;
}

export interface PortfolioSummaryDto {
  portfolioId: string;
  name: string;
  isActive: boolean;
  exposureCapNotional: string;
  aggregateExposureNotional: string;
  openPositionCount: number;
  updatedAt: string;
  strategy?: StrategyDto;
}

export interface PortfolioPositionDto {
  portfolioId: string;
  instrument: InstrumentDto;
  quantity: string;
  averageEntryPrice: string;
  exposureNotional: string;
  lastFillId: string;
  updatedAt: string;
}

export interface PortfolioInstrumentConfigDto {
  portfolioId: string;
  instrument: InstrumentDto;
  enabled: boolean;
  targetNotional: string;
  maxTradeNotional: string;
  maxPositionNotional: string;
  updatedAt: string;
}

export interface ExecutionFillDto {
  fillId: string;
  orderId: string;
  portfolioId: string;
  instrumentId: string;
  sequence: number;
  fillNotional: string;
  fillQuantity: string;
  fillPrice: string;
  cumulativeFilledNotional: string;
  cumulativeFilledQuantity: string;
  orderStatus: OrderStatusName;
  filledAt: string;
}

export interface ExecutionOrderDto {
  orderId: string;
  approvalEventId: string;
  candidateIdempotencyKey: string;
  sourceEventId: string;
  portfolioId: string;
  instrumentId: string;
  instrument?: InstrumentDto;
  signalId: string;
  side: SignalSideName;
  requestedNotional: string;
  requestedQuantity: string;
  referencePrice: string;
  status: OrderStatusName;
  approvedAt: string;
  placedAt: string;
  lastActivityAt: string;
  fills: ExecutionFillDto[];
}

export interface PortfolioReadResponseDto {
  summary: PortfolioSummaryDto;
  positions: PortfolioPositionDto[];
  configuredInstruments: PortfolioInstrumentConfigDto[];
  recentOrders: ExecutionOrderDto[];
}

export interface ListPortfoliosResponseDto {
  portfolios: PortfolioSummaryDto[];
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

export interface RegisterPortfolioInstrumentRequestDto {
  symbol: string;
  assetClass: AssetClassName;
  venue: string;
  externalSymbol?: string;
  enabled: boolean;
  targetNotional: string;
  maxTradeNotional: string;
  maxPositionNotional: string;
}

export interface UpdatePortfolioRequestDto {
  exposureCapNotional?: string;
  isActive?: boolean;
}

export interface UpdatePortfolioInstrumentConfigRequestDto {
  enabled?: boolean;
  targetNotional?: string;
  maxTradeNotional?: string;
  maxPositionNotional?: string;
  maxOpenTrades?: number;
  maxDailyTurnoverNotional?: string;
  cooldownSeconds?: number;
  maxConsecutiveRejections?: number;
}

export interface RiskDecisionDto {
  id: string;
  portfolioId: string;
  instrumentId: string;
  decision: string;
  reasonCodes: string[];
  requestedNotional: string;
  referencePrice: string;
  decidedAt: string;
  sourceEventId: string;
}

export interface RiskDecisionListResponseDto {
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

export interface RiskConfigAuditLogListResponseDto {
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

export interface ListStrategiesResponseDto {
  strategies: StrategyDto[];
}

export interface CreateStrategyRequestDto {
  name: string;
  description?: string;
  allowedSides: number[];
  minIntervalSecs?: number;
  activeTimeStart?: string;
  activeTimeEnd?: string;
}

export interface UpdateStrategyRequestDto {
  name?: string;
  description?: string;
  allowedSides?: number[];
  minIntervalSecs?: number;
  activeTimeStart?: string;
  activeTimeEnd?: string;
}

export interface AssignStrategyRequestDto {
  strategyId?: string;
}

export class DashboardApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly details?: string[],
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'DashboardApiError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const normalizeApiBaseUrl = (value?: string): string => {
  const trimmed = value?.trim() || DEFAULT_API_BASE_URL;

  return trimmed.replace(/\/+$/, '');
};

const joinMessages = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (Array.isArray(value)) {
    const messages = value.filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );

    return messages.length > 0 ? messages.join(', ') : undefined;
  }

  return undefined;
};

const readErrorBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const toApiError = async (response: Response): Promise<DashboardApiError> => {
  const body = await readErrorBody(response);
  const message = isRecord(body)
    ? (joinMessages(body.message) ?? response.statusText)
    : response.statusText;
  const details =
    isRecord(body) && Array.isArray(body.message)
      ? body.message.filter((item): item is string => typeof item === 'string')
      : undefined;
  const code =
    isRecord(body) && typeof body.code === 'string' ? body.code : undefined;

  return new DashboardApiError(
    message || 'Request failed',
    response.status,
    details,
    code,
  );
};

const requestJson = async <T>(
  input: string,
  init?: RequestInit,
): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(input, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      ...init,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DashboardApiError(`Network error: ${message}`);
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as T;
};

export const createDashboardApi = (
  apiBaseUrl = normalizeApiBaseUrl(
    import.meta.env.VITE_API_BASE_URL as string | undefined,
  ),
) => {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl);

  return {
    listPortfolios: async (): Promise<ListPortfoliosResponseDto> =>
      await requestJson<ListPortfoliosResponseDto>(`${baseUrl}/portfolios`),

    getPortfolio: async (
      portfolioId: string,
      recentOrdersLimit = RECENT_ORDERS_LIMIT,
    ): Promise<PortfolioReadResponseDto> => {
      const encodedPortfolioId = encodeURIComponent(portfolioId);
      const url = `${baseUrl}/portfolios/${encodedPortfolioId}?recentOrdersLimit=${recentOrdersLimit}`;

      return await requestJson<PortfolioReadResponseDto>(url);
    },

    registerPortfolioInstrument: async (
      portfolioId: string,
      payload: RegisterPortfolioInstrumentRequestDto,
    ): Promise<PortfolioInstrumentConfigDto> =>
      await requestJson<PortfolioInstrumentConfigDto>(
        `${baseUrl}/portfolios/${encodeURIComponent(portfolioId)}/instrument`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),

    updatePortfolio: async (
      portfolioId: string,
      payload: UpdatePortfolioRequestDto,
    ): Promise<PortfolioSummaryDto> =>
      await requestJson<PortfolioSummaryDto>(
        `${baseUrl}/portfolios/${encodeURIComponent(portfolioId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),

    updatePortfolioInstrumentConfig: async (
      portfolioId: string,
      instrumentId: string,
      payload: UpdatePortfolioInstrumentConfigRequestDto,
    ): Promise<PortfolioInstrumentConfigDto> =>
      await requestJson<PortfolioInstrumentConfigDto>(
        `${baseUrl}/portfolios/${encodeURIComponent(portfolioId)}/instrument/${encodeURIComponent(instrumentId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),

    listRiskDecisions: async (
      portfolioId: string,
      params?: { decision?: string; limit?: number; cursor?: string },
    ): Promise<RiskDecisionListResponseDto> => {
      const query = new URLSearchParams();
      if (params?.decision) query.set('decisionFilter', params.decision);
      if (params?.limit != null) query.set('limit', String(params.limit));
      if (params?.cursor) query.set('cursor', params.cursor);
      const qs = query.toString() ? `?${query.toString()}` : '';

      return await requestJson<RiskDecisionListResponseDto>(
        `${baseUrl}/portfolios/${encodeURIComponent(portfolioId)}/decisions${qs}`,
      );
    },

    listRiskConfigAuditLog: async (
      portfolioId: string,
      params?: { limit?: number; cursor?: string },
    ): Promise<RiskConfigAuditLogListResponseDto> => {
      const query = new URLSearchParams();
      if (params?.limit != null) query.set('limit', String(params.limit));
      if (params?.cursor) query.set('cursor', params.cursor);
      const qs = query.toString() ? `?${query.toString()}` : '';

      return await requestJson<RiskConfigAuditLogListResponseDto>(
        `${baseUrl}/portfolios/${encodeURIComponent(portfolioId)}/audit${qs}`,
      );
    },

    listSignals: async (
      limit = RECENT_SIGNALS_LIMIT,
    ): Promise<GetLatestSignalsResponseDto> =>
      await requestJson<GetLatestSignalsResponseDto>(
        `${baseUrl}/signals?limit=${limit}`,
      ),

    listStrategies: async (): Promise<ListStrategiesResponseDto> =>
      await requestJson<ListStrategiesResponseDto>(`${baseUrl}/strategies`),

    createStrategy: async (
      payload: CreateStrategyRequestDto,
    ): Promise<StrategyDto> =>
      await requestJson<StrategyDto>(`${baseUrl}/strategies`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    updateStrategy: async (
      strategyId: string,
      payload: UpdateStrategyRequestDto,
    ): Promise<StrategyDto> =>
      await requestJson<StrategyDto>(
        `${baseUrl}/strategies/${encodeURIComponent(strategyId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),

    assignStrategyToPortfolio: async (
      portfolioId: string,
      payload: AssignStrategyRequestDto,
    ): Promise<void> => {
      await requestJson<unknown>(
        `${baseUrl}/portfolios/${encodeURIComponent(portfolioId)}/strategy`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
    },
  };
};
