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

    listSignals: async (
      limit = RECENT_SIGNALS_LIMIT,
    ): Promise<GetLatestSignalsResponseDto> =>
      await requestJson<GetLatestSignalsResponseDto>(
        `${baseUrl}/signals?limit=${limit}`,
      ),
  };
};
