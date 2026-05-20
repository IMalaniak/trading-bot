import { type ClientGrpc } from '@nestjs/microservices';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GetLatestSignalsRequest,
  GetLatestSignalsResponse,
  PREDICTION_ENGINE_CLIENT,
  SignalSide,
} from '@trading-bot/common/proto';
import { lastValueFrom, Observable, of, throwError } from 'rxjs';
import type { Mock, Mocked } from 'vitest';

import { SignalSideName } from '../portfolio/dto/signal-side-name.enum';
import { SignalsService } from './signals.service';

describe('SignalsService', () => {
  let service: SignalsService;
  let getLatestSignalsMock: Mock<
    (data: GetLatestSignalsRequest) => Observable<GetLatestSignalsResponse>
  >;

  beforeEach(async () => {
    getLatestSignalsMock = vi.fn();
    const grpcClient = {
      getService: vi.fn().mockReturnValue({
        getLatestSignals: getLatestSignalsMock,
      }),
    } as unknown as Mocked<ClientGrpc>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignalsService,
        {
          provide: PREDICTION_ENGINE_CLIENT,
          useValue: grpcClient,
        },
      ],
    }).compile();

    service = module.get<SignalsService>(SignalsService);
    service.onModuleInit();
  });

  it('maps latest signal results from gRPC', async () => {
    getLatestSignalsMock.mockReturnValue(
      of({
        signals: [
          {
            id: 'signal-1',
            instrumentId: 'instrument-1',
            side: SignalSide.BUY,
            price: 100.5,
            timestamp: 1_700_000_000_000,
          },
        ],
      }),
    );

    const result = await lastValueFrom(
      service.getLatestSignals({
        instrumentId: 'instrument-1',
        limit: 10,
      }),
    );

    expect(getLatestSignalsMock).toHaveBeenCalledWith({
      instrumentId: 'instrument-1',
      limit: 10,
    });
    expect(result).toEqual({
      signals: [
        {
          id: 'signal-1',
          instrumentId: 'instrument-1',
          side: SignalSideName.BUY,
          price: 100.5,
          timestamp: 1_700_000_000_000,
        },
      ],
    });
  });

  it('uses service defaults when optional query values are absent', async () => {
    getLatestSignalsMock.mockReturnValue(of({ signals: [] }));

    await lastValueFrom(service.getLatestSignals({}));

    expect(getLatestSignalsMock).toHaveBeenCalledWith({
      instrumentId: '',
      limit: 0,
    });
  });

  it('maps unknown upstream errors to HTTP errors', async () => {
    getLatestSignalsMock.mockReturnValue(
      throwError(() => new Error('connection refused')),
    );

    await expect(lastValueFrom(service.getLatestSignals({}))).rejects.toThrow(
      'Failed to get latest signals: connection refused',
    );
  });
});
