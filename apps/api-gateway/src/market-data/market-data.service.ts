import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import {
  AppResponseCode,
  GrpcStatusCode,
  isAppResponseCode,
  isGrpcServiceError,
} from '@trading-bot/common';
import { DATA_INGESTION_CLIENT } from '@trading-bot/common/proto';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';

import { grpcStatusToHttpStatus } from '../utils/grpc-status-to-http-status';
import { IDataIngestion } from './data-ingestion.client.interface';
import {
  GetMarketDataBarsQueryDto,
  GetMarketDataBarsResponseDto,
  MarketDataBarDto,
} from './dto/market-data-bars.dto';

const REQUEST_TIMEOUT_MS = 5000;

@Injectable()
export class MarketDataService implements OnModuleInit {
  private dataIngestionClient: IDataIngestion;

  constructor(
    @Inject(DATA_INGESTION_CLIENT)
    private readonly dataIngestionGrpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.dataIngestionClient =
      this.dataIngestionGrpcClient.getService<IDataIngestion>('DataIngestion');
  }

  public getMarketDataBars(
    query: Omit<GetMarketDataBarsQueryDto, 'limit'> & { limit?: number },
  ): Observable<GetMarketDataBarsResponseDto> {
    return this.dataIngestionClient
      .getMarketDataBars({
        instrumentId: query.instrumentId,
        interval: query.interval,
        fromMs: query.from,
        toMs: query.to,
        limit: query.limit ?? 0,
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((response) => ({
          bars: response.bars.map(
            (bar): MarketDataBarDto => ({
              instrumentId: bar.instrumentId,
              symbol: bar.symbol,
              venue: bar.venue,
              interval: bar.interval,
              openTimeMs: bar.openTimeMs,
              closeTimeMs: bar.closeTimeMs,
              open: bar.open,
              high: bar.high,
              low: bar.low,
              close: bar.close,
              volume: bar.volume,
              quoteVolume: bar.quoteVolume,
              tradeCount: bar.tradeCount,
            }),
          ),
        })),
        catchError((err: unknown) =>
          this.mapUpstreamError('get market data bars', err),
        ),
      );
  }

  private mapUpstreamError(operation: string, err: unknown): Observable<never> {
    if (isGrpcServiceError(err)) {
      const { appCode, code, details, message } = err;
      const status = grpcStatusToHttpStatus(code);
      const responseCode = isAppResponseCode(appCode)
        ? appCode
        : this.getTransportAppCode(code);

      return throwError(
        () =>
          new HttpException(
            {
              message: details || message || 'gRPC error',
              code: responseCode,
            },
            status,
          ),
      );
    }

    if (err instanceof HttpException) {
      return throwError(() => err);
    }

    if (err instanceof TimeoutError) {
      return throwError(
        () =>
          new HttpException(
            {
              message: `Timed out while trying to ${operation}`,
              code: AppResponseCode.UPSTREAM_TIMEOUT,
            },
            HttpStatus.GATEWAY_TIMEOUT,
          ),
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    return throwError(
      () =>
        new HttpException(
          {
            message: `Failed to ${operation}: ${message}`,
            code: AppResponseCode.INTERNAL_ERROR,
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        ),
    );
  }

  private getTransportAppCode(code: GrpcStatusCode): AppResponseCode {
    if (code === GrpcStatusCode.DEADLINE_EXCEEDED) {
      return AppResponseCode.UPSTREAM_TIMEOUT;
    }

    if (code === GrpcStatusCode.UNAVAILABLE) {
      return AppResponseCode.UPSTREAM_UNAVAILABLE;
    }

    return AppResponseCode.INTERNAL_ERROR;
  }
}
