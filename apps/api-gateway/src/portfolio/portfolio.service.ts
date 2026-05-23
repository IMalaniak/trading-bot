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

import { grpcStatusToHttpStatus } from '../utils/grpc-status-to-http-status';
import { InstrumentDto } from './dto/instrument.dto';
import {
  ListRiskConfigAuditLogQueryDto,
  ListRiskDecisionsQueryDto,
  RiskConfigAuditLogEntryDto,
  RiskConfigAuditLogListResponseDto,
  RiskDecisionDto,
  RiskDecisionListResponseDto,
} from './dto/portfolio-decisions.dto';
import {
  RegisterPortfolioInstrumentRequestDto,
  RegisterPortfolioInstrumentResponseDto,
} from './dto/portfolio-instrument.dto';
import {
  DEFAULT_RECENT_ORDER_LIMIT,
  ExecutionOrderDto,
  ListPortfoliosResponseDto,
  PortfolioInstrumentConfigDto,
  PortfolioPositionDto,
  PortfolioReadResponseDto,
  PortfolioSummaryDto,
} from './dto/portfolio-read.dto';
import {
  UpdatePortfolioInstrumentConfigRestRequestDto,
  UpdatePortfolioRestRequestDto,
} from './dto/portfolio-write.dto';
import {
  AssignStrategyBodyDto,
  AssignStrategyToPortfolioResponseDto,
  CreateStrategyBodyDto,
  ListStrategiesResponseDto,
  StrategyDto,
  UpdateStrategyBodyDto,
} from './dto/strategy.dto';
import { IExecutionEngine } from './execution-engine.client.interface';
import { IRiskAndPortfolioManager } from './risk-and-portfolio.client.interface';

function mapStrategy(s: {
  id: string;
  name: string;
  description?: string;
  allowedSides: number[];
  minIntervalSecs?: number;
  activeTimeStart?: string;
  activeTimeEnd?: string;
  createdAt: string;
  updatedAt: string;
}): StrategyDto {
  return {
    id: s.id,
    name: s.name,
    ...(s.description !== undefined && { description: s.description }),
    allowedSides: s.allowedSides,
    ...(s.minIntervalSecs !== undefined && {
      minIntervalSecs: s.minIntervalSecs,
    }),
    ...(s.activeTimeStart !== undefined && {
      activeTimeStart: s.activeTimeStart,
    }),
    ...(s.activeTimeEnd !== undefined && { activeTimeEnd: s.activeTimeEnd }),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

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

  public listPortfolios(): Observable<ListPortfoliosResponseDto> {
    return this.portfolioManagerClient.listPortfolios({}).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((response) => {
        if (!Array.isArray(response.portfolios)) {
          throw new HttpException(
            {
              message:
                'Risk service returned invalid portfolio list payload: portfolios must be an array',
              code: AppResponseCode.UPSTREAM_UNAVAILABLE,
            },
            HttpStatus.BAD_GATEWAY,
          );
        }

        return ListPortfoliosResponseDto.fromGRPC(response);
      }),
      catchError((err: unknown) =>
        this.mapUpstreamError('list portfolios', err),
      ),
    );
  }

  public registerPortfolioInstrument(
    portfolioId: string,
    data: RegisterPortfolioInstrumentRequestDto,
  ): Observable<RegisterPortfolioInstrumentResponseDto> {
    return this.portfolioManagerClient
      .registerPortfolioInstrument(data.toGRPC(portfolioId))
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map(({ configuredInstrument }) => {
          if (!configuredInstrument) {
            throw new HttpException(
              {
                message: 'Risk service returned no configured instrument',
                code: AppResponseCode.UPSTREAM_UNAVAILABLE,
              },
              HttpStatus.BAD_GATEWAY,
            );
          }

          return PortfolioInstrumentConfigDto.fromGRPC(configuredInstrument);
        }),
        catchError((err: unknown) =>
          this.mapUpstreamError('register portfolio instrument', err),
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
              code: AppResponseCode.UPSTREAM_UNAVAILABLE,
            },
            HttpStatus.BAD_GATEWAY,
          );
        }

        if (!Array.isArray(portfolio.configuredInstruments)) {
          throw new HttpException(
            {
              message:
                'Risk service returned invalid portfolio payload: configuredInstruments must be an array',
              code: AppResponseCode.UPSTREAM_UNAVAILABLE,
            },
            HttpStatus.BAD_GATEWAY,
          );
        }

        if (!Array.isArray(execution.orders)) {
          throw new HttpException(
            {
              message:
                'Execution service returned invalid orders payload: orders must be an array',
              code: AppResponseCode.UPSTREAM_UNAVAILABLE,
            },
            HttpStatus.BAD_GATEWAY,
          );
        }

        const portfolioSummary = portfolio.summary;

        if (!portfolioSummary) {
          throw new HttpException(
            {
              message: 'Risk service returned no portfolio summary',
              code: AppResponseCode.UPSTREAM_UNAVAILABLE,
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
                  code: AppResponseCode.UPSTREAM_UNAVAILABLE,
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
              configuredInstruments: portfolio.configuredInstruments.map(
                (config) => PortfolioInstrumentConfigDto.fromGRPC(config),
              ),
              recentOrders: execution.orders.map((order) =>
                ExecutionOrderDto.fromGRPC(
                  order,
                  instrumentsById.get(order.instrumentId),
                ),
              ),
              strategy: portfolio.strategy
                ? mapStrategy(portfolio.strategy)
                : undefined,
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

  public updatePortfolio(
    portfolioId: string,
    data: UpdatePortfolioRestRequestDto,
  ): Observable<PortfolioSummaryDto> {
    return this.portfolioManagerClient
      .updatePortfolio(data.toGRPC(portfolioId))
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map(({ summary }) => {
          if (!summary) {
            throw new HttpException(
              {
                message: 'Risk service returned no portfolio summary',
                code: AppResponseCode.UPSTREAM_UNAVAILABLE,
              },
              HttpStatus.BAD_GATEWAY,
            );
          }

          return PortfolioSummaryDto.fromGRPC(summary);
        }),
        catchError((err: unknown) =>
          this.mapUpstreamError('update portfolio', err),
        ),
      );
  }

  public updatePortfolioInstrumentConfig(
    portfolioId: string,
    instrumentId: string,
    data: UpdatePortfolioInstrumentConfigRestRequestDto,
  ): Observable<PortfolioInstrumentConfigDto> {
    return this.portfolioManagerClient
      .updatePortfolioInstrumentConfig(data.toGRPC(portfolioId, instrumentId))
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map(({ configuredInstrument }) => {
          if (!configuredInstrument) {
            throw new HttpException(
              {
                message: 'Risk service returned no configured instrument',
                code: AppResponseCode.UPSTREAM_UNAVAILABLE,
              },
              HttpStatus.BAD_GATEWAY,
            );
          }

          return PortfolioInstrumentConfigDto.fromGRPC(configuredInstrument);
        }),
        catchError((err: unknown) =>
          this.mapUpstreamError('update portfolio instrument config', err),
        ),
      );
  }

  public listRiskDecisions(
    portfolioId: string,
    query: ListRiskDecisionsQueryDto,
  ): Observable<RiskDecisionListResponseDto> {
    return this.portfolioManagerClient
      .listRiskDecisions({
        portfolioId,
        ...(query.decisionFilter !== undefined && {
          decisionFilter: query.decisionFilter,
        }),
        ...(query.limit !== undefined && { limit: query.limit }),
        ...(query.cursor !== undefined && { cursor: query.cursor }),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((response) => ({
          decisions: response.decisions.map((d) => RiskDecisionDto.fromGRPC(d)),
          ...(response.nextCursor !== undefined && {
            nextCursor: response.nextCursor,
          }),
        })),
        catchError((err: unknown) =>
          this.mapUpstreamError('list risk decisions', err),
        ),
      );
  }

  public listRiskConfigAuditLog(
    portfolioId: string,
    query: ListRiskConfigAuditLogQueryDto,
  ): Observable<RiskConfigAuditLogListResponseDto> {
    return this.portfolioManagerClient
      .listRiskConfigAuditLog({
        portfolioId,
        ...(query.limit !== undefined && { limit: query.limit }),
        ...(query.cursor !== undefined && { cursor: query.cursor }),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((response) => ({
          entries: response.entries.map((e) =>
            RiskConfigAuditLogEntryDto.fromGRPC(e),
          ),
          ...(response.nextCursor !== undefined && {
            nextCursor: response.nextCursor,
          }),
        })),
        catchError((err: unknown) =>
          this.mapUpstreamError('list risk config audit log', err),
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

  public createStrategy(body: CreateStrategyBodyDto): Observable<StrategyDto> {
    return this.portfolioManagerClient
      .createStrategy({
        name: body.name,
        allowedSides: body.allowedSides,
        ...(body.description !== undefined && {
          description: body.description,
        }),
        ...(body.minIntervalSecs !== undefined && {
          minIntervalSecs: body.minIntervalSecs,
        }),
        ...(body.activeTimeStart !== undefined && {
          activeTimeStart: body.activeTimeStart,
        }),
        ...(body.activeTimeEnd !== undefined && {
          activeTimeEnd: body.activeTimeEnd,
        }),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((response) => mapStrategy(response.strategy!)),
        catchError((err: unknown) =>
          this.mapUpstreamError('create strategy', err),
        ),
      );
  }

  public updateStrategy(
    strategyId: string,
    body: UpdateStrategyBodyDto,
  ): Observable<StrategyDto> {
    return this.portfolioManagerClient
      .updateStrategy({
        strategyId,
        allowedSides: body.allowedSides,
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && {
          description: body.description,
        }),
        ...(body.minIntervalSecs !== undefined && {
          minIntervalSecs: body.minIntervalSecs,
        }),
        ...(body.activeTimeStart !== undefined && {
          activeTimeStart: body.activeTimeStart,
        }),
        ...(body.activeTimeEnd !== undefined && {
          activeTimeEnd: body.activeTimeEnd,
        }),
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((response) => mapStrategy(response.strategy!)),
        catchError((err: unknown) =>
          this.mapUpstreamError('update strategy', err),
        ),
      );
  }

  public getStrategy(strategyId: string): Observable<StrategyDto> {
    return this.portfolioManagerClient.getStrategy({ strategyId }).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((response) => mapStrategy(response.strategy!)),
      catchError((err: unknown) => this.mapUpstreamError('get strategy', err)),
    );
  }

  public listStrategies(): Observable<ListStrategiesResponseDto> {
    return this.portfolioManagerClient.listStrategies({}).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      map((response) => ({
        strategies: response.strategies.map(mapStrategy),
      })),
      catchError((err: unknown) =>
        this.mapUpstreamError('list strategies', err),
      ),
    );
  }

  public assignStrategyToPortfolio(
    portfolioId: string,
    body: AssignStrategyBodyDto,
  ): Observable<AssignStrategyToPortfolioResponseDto> {
    return this.portfolioManagerClient
      .assignStrategyToPortfolio({
        portfolioId,
        strategyId: body.strategyId,
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((response) => ({
          ...(response.summary !== undefined && { summary: response.summary }),
          ...(response.strategy !== undefined && {
            strategy: mapStrategy(response.strategy),
          }),
        })),
        catchError((err: unknown) =>
          this.mapUpstreamError('assign strategy to portfolio', err),
        ),
      );
  }
}
