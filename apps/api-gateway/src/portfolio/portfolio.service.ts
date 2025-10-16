import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import { isGrpcServiceError } from '@trading-bot/common';
import { PORTFOLIO_MANAGER_CLIENT } from '@trading-bot/common/proto';
import { catchError, map, Observable, throwError, timeout } from 'rxjs';

import { grpcCodeToHttpStatus } from '../utils/grpc-code-to-http-status';
import { InstrumentDto } from './dto/instrument.dto';
import {
  RegisterInstrumentRequestDto,
  RegisterInstrumentResponseDto,
} from './dto/register-instrument.dto';
import { IRiskAndPortfolioManager } from './risk-and-portfolio.client.interface';

@Injectable()
export class PortfolioService implements OnModuleInit {
  private portfolioManagerClient: IRiskAndPortfolioManager;

  constructor(@Inject(PORTFOLIO_MANAGER_CLIENT) private client: ClientGrpc) {}

  onModuleInit() {
    this.portfolioManagerClient =
      this.client.getService<IRiskAndPortfolioManager>(
        'RiskAndPortfolioManager',
      );
  }

  public registerInstrument(
    data: RegisterInstrumentRequestDto,
  ): Observable<RegisterInstrumentResponseDto> {
    const REQUEST_TIMEOUT_MS = 5000;

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
      catchError((err: unknown) => {
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

        const message = err instanceof Error ? err.message : String(err);
        return throwError(
          () =>
            new HttpException(
              { message: `Failed to register instrument: ${message}` },
              HttpStatus.INTERNAL_SERVER_ERROR,
            ),
        );
      }),
    );
  }
}
