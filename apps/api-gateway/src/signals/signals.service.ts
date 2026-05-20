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
import { PREDICTION_ENGINE_CLIENT } from '@trading-bot/common/proto';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';

import { grpcStatusToHttpStatus } from '../utils/grpc-status-to-http-status';
import {
  GetLatestSignalsQueryDto,
  GetLatestSignalsResponseDto,
  SignalDto,
} from './dto/signals.dto';
import { IPredictionEngineSignals } from './prediction-engine.client.interface';

const REQUEST_TIMEOUT_MS = 5000;

@Injectable()
export class SignalsService implements OnModuleInit {
  private signalsClient: IPredictionEngineSignals;

  constructor(
    @Inject(PREDICTION_ENGINE_CLIENT)
    private readonly predictionEngineGrpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.signalsClient =
      this.predictionEngineGrpcClient.getService<IPredictionEngineSignals>(
        'Signals',
      );
  }

  public getLatestSignals(
    query: GetLatestSignalsQueryDto,
  ): Observable<GetLatestSignalsResponseDto> {
    return this.signalsClient
      .getLatestSignals({
        instrumentId: query.instrumentId ?? '',
        limit: query.limit ?? 0,
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((response) => ({
          signals: response.signals.map((signal) => SignalDto.fromGRPC(signal)),
        })),
        catchError((err: unknown) =>
          this.mapUpstreamError('get latest signals', err),
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
