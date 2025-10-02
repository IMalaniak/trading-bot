import { Test, TestingModule } from '@nestjs/testing';

import { PORTFOLIO_CLIENT, SIGNALS_CLIENT } from './grpc.constants';
import { GrpcClientsModule } from './grpc.module';

describe('GrpcClientsModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [GrpcClientsModule],
    }).compile();
  });

  it('provides SIGNALS_CLIENT and PORTFOLIO_CLIENT', () => {
    const signals = module.get(SIGNALS_CLIENT);
    const portfolio = module.get(PORTFOLIO_CLIENT);

    expect(signals).toBeDefined();
    expect(portfolio).toBeDefined();
  });
});
