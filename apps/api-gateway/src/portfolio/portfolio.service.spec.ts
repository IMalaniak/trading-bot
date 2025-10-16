import { Test, TestingModule } from '@nestjs/testing';
import { PORTFOLIO_MANAGER_CLIENT } from '@trading-bot/common/proto';

import { PortfolioService } from './portfolio.service';

describe('PortfolioService', () => {
  let service: PortfolioService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        {
          provide: PORTFOLIO_MANAGER_CLIENT,
          useValue: {
            // Mock the methods you need for your tests
            getService: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PortfolioService>(PortfolioService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
