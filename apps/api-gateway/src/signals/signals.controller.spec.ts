import { PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import type { Mocked } from 'vitest';

import { SignalSideName } from '../portfolio/dto/signal-side-name.enum';
import { GetLatestSignalsQueryDto } from './dto/signals.dto';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';

describe('SignalsController', () => {
  let controller: SignalsController;
  let service: Mocked<SignalsService>;
  let getLatestSignalsMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    getLatestSignalsMock = vi.fn();
    service = {
      getLatestSignals: getLatestSignalsMock,
    } as unknown as Mocked<SignalsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SignalsController],
      providers: [
        {
          provide: SignalsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<SignalsController>(SignalsController);
  });

  it('uses the signals route prefix', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SignalsController)).toBe(
      'signals',
    );
  });

  it('delegates to SignalsService.getLatestSignals', () => {
    const query: GetLatestSignalsQueryDto = {
      instrumentId: 'instrument-1',
      limit: 10,
    };
    const response = {
      signals: [
        {
          id: 'signal-1',
          instrumentId: 'instrument-1',
          side: SignalSideName.BUY,
          price: 100,
          timestamp: 1_700_000_000_000,
        },
      ],
    };
    getLatestSignalsMock.mockReturnValue(of(response));

    expect(controller.getLatestSignals(query)).toBe(
      getLatestSignalsMock.mock.results[0]?.value,
    );
    expect(getLatestSignalsMock).toHaveBeenCalledWith(query);
  });
});
