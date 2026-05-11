import { URLS } from './e2e-env';

export type SignalSideName = 'BUY' | 'SELL' | 'SIGNAL_SIDE_UNSPECIFIED';
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
}

export interface ListPortfoliosResponseDto {
  portfolios: PortfolioSummaryDto[];
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
}
