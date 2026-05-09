import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import { isGrpcServiceError } from '@trading-bot/common';
import {
  EXECUTION_ENGINE_CLIENT,
  PORTFOLIO_MANAGER_CLIENT,
} from '@trading-bot/common/proto';
import {
  catchError,
  forkJoin,
  map,
  Observable,
  of,
  switchMap,
  throwError,
  timeout,
  TimeoutError,
} from 'rxjs';

import { grpcCodeToHttpStatus } from '../utils/grpc-code-to-http-status';
import { InstrumentDto } from './dto/instrument.dto';
import {
  DEFAULT_RECENT_ORDER_LIMIT,
  ExecutionOrderDto,
  PortfolioPositionDto,
  PortfolioReadResponseDto,
  PortfolioSummaryDto,
} from './dto/portfolio-read.dto';
import {
  RegisterInstrumentRequestDto,
  RegisterInstrumentResponseDto,
} from './dto/register-instrument.dto';
import { IExecutionEngine } from './execution-engine.client.interface';
import { IRiskAndPortfolioManager } from './risk-and-portfolio.client.interface';

const REQUEST_TIMEOUT_MS = 5000;

@Injectable()
export class PortfolioService implements OnModuleInit {
  private portfolioManagerClient: IRiskAndPortfolioManager;
  private executionEngineClient: IExecutionEngine;

  constructor(
    @Inject(PORTFOLIO_MANAGER_CLIENT)
    private readonly portfolioManagerGrpcClient: ClientGrpc,
    @Inject(EXECUTION_ENGINE_CLIENT)
    private readonly executionEngineGrpcClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.portfolioManagerClient =
      this.portfolioManagerGrpcClient.getService<IRiskAndPortfolioManager>(
        'RiskAndPortfolioManager',
      );
    this.executionEngineClient =
      this.executionEngineGrpcClient.getService<IExecutionEngine>(
        'ExecutionEngine',
      );
  }

  public registerInstrument(
    data: RegisterInstrumentRequestDto,
  ): Observable<RegisterInstrumentResponseDto> {
    return this.portfolioManagerClient.registerInstrument(data.toGRPC()).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map(({ instrument }) => {
        if (!instrument) {
          // domain-level missing-instrument; map to HTTP 502 (Bad Gateway) because upstream failed
          throw new HttpException(
            {
              message: 'Risk service returned no instrument',
              type: 'NoInstrument',
            },
            HttpStatus.BAD_GATEWAY,
          );
        }
        return InstrumentDto.fromGRPC(instrument);
      }),
      catchError((err: unknown) =>
        this.mapUpstreamError('register instrument', err),
      ),
    );
  }

  public getPortfolio(
    portfolioId: string,
    recentOrdersLimit = DEFAULT_RECENT_ORDER_LIMIT,
  ): Observable<PortfolioReadResponseDto> {
    return forkJoin({
      portfolio: this.portfolioManagerClient.getPortfolio({ portfolioId }),
      execution: this.executionEngineClient.listPortfolioExecutionOrders({
        portfolioId,
        limit: recentOrdersLimit,
      }),
    }).pipe(
      switchMap(({ portfolio, execution }) => {
        if (!Array.isArray(portfolio.positions)) {
          throw new HttpException(
            {
              message:
                'Risk service returned invalid portfolio payload: positions must be an array',
              type: 'InvalidPortfolioPayload',
            },
            HttpStatus.BAD_GATEWAY,
          );
        }

        if (!Array.isArray(execution.orders)) {
          throw new HttpException(
            {
              message:
                'Execution service returned invalid orders payload: orders must be an array',
              type: 'InvalidExecutionPayload',
            },
            HttpStatus.BAD_GATEWAY,
          );
        }

        const portfolioSummary = portfolio.summary;

        if (!portfolioSummary) {
          throw new HttpException(
            {
              message: 'Risk service returned no portfolio summary',
              type: 'NoPortfolioSummary',
            },
            HttpStatus.BAD_GATEWAY,
          );
        }

        const instrumentsById = new Map<string, InstrumentDto>();
        for (const position of portfolio.positions) {
          if (position.instrument) {
            instrumentsById.set(
              position.instrument.id,
              InstrumentDto.fromGRPC(position.instrument),
            );
          }
        }
        const missingInstrumentIds = [
          ...new Set(
            execution.orders
              .map((order) => order.instrumentId)
              .filter((instrumentId) => !instrumentsById.has(instrumentId)),
          ),
        ];

        const instruments$ =
          missingInstrumentIds.length > 0
            ? this.portfolioManagerClient.listInstruments({
                instrumentIds: missingInstrumentIds,
              })
            : of({ instruments: [] });

        return instruments$.pipe(
          map(({ instruments }) => {
            if (!Array.isArray(instruments)) {
              throw new HttpException(
                {
                  message:
                    'Risk service returned invalid instruments payload: instruments must be an array',
                  type: 'InvalidInstrumentsPayload',
                },
                HttpStatus.BAD_GATEWAY,
              );
            }

            for (const instrument of instruments) {
              instrumentsById.set(
                instrument.id,
                InstrumentDto.fromGRPC(instrument),
              );
            }

            return {
              summary: PortfolioSummaryDto.fromGRPC(portfolioSummary),
              positions: portfolio.positions.map((position) =>
                PortfolioPositionDto.fromGRPC(position),
              ),
              recentOrders: execution.orders.map((order) =>
                ExecutionOrderDto.fromGRPC(
                  order,
                  instrumentsById.get(order.instrumentId),
                ),
              ),
            };
          }),
        );
      }),
      timeout(REQUEST_TIMEOUT_MS),
      catchError((err: unknown) => this.mapUpstreamError('get portfolio', err)),
    );
  }

  private mapUpstreamError(operation: string, err: unknown): Observable<never> {
    if (isGrpcServiceError(err)) {
      const { code, details } = err;
      const status = grpcCodeToHttpStatus(code);
      return throwError(
        () =>
          new HttpException(
            { message: details || 'gRPC error', grpcCode: code },
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
            { message: `Timed out while trying to ${operation}` },
            HttpStatus.GATEWAY_TIMEOUT,
          ),
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    return throwError(
      () =>
        new HttpException(
          { message: `Failed to ${operation}: ${message}` },
          HttpStatus.INTERNAL_SERVER_ERROR,
        ),
    );
  }
}
