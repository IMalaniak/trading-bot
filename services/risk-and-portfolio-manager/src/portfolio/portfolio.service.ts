import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  RegisterInstrumentRequest,
  RegisterInstrumentResponse,
} from '../types/services/risk_manager';

@Injectable()
export class PortfolioService {
  registerInstrument(
    data: RegisterInstrumentRequest,
  ): Promise<RegisterInstrumentResponse> {
    return Promise.resolve({
      instrument: {
        instrumentId: randomUUID(),
        ...data,
      },
    });
  }
}
