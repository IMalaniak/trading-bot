import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { PortfolioQueryService } from './services/portfolio-query.service';

describe('PortfolioController', () => {
  let portfolioQueryService: {
    getPortfolio: jest.MockedFunction<PortfolioQueryService['getPortfolio']>;
    listInstruments: jest.MockedFunction<
      PortfolioQueryService['listInstruments']
    >;
  };
  let controller: PortfolioController;

  beforeEach(() => {
    portfolioQueryService = {
      getPortfolio: jest.fn().mockResolvedValue({ positions: [] }),
      listInstruments: jest.fn().mockResolvedValue({ instruments: [] }),
    };
    controller = new PortfolioController(
      {} as PortfolioService,
      portfolioQueryService as unknown as PortfolioQueryService,
    );
  });

  it('passes validated portfolio ids to the query service', async () => {
    await controller.getPortfolio({ portfolioId: 'portfolio-alpha' });

    expect(portfolioQueryService.getPortfolio).toHaveBeenCalledWith(
      'portfolio-alpha',
    );
  });

  it('passes validated instrument id lists to the query service', async () => {
    await controller.listInstruments({ instrumentIds: ['instrument-1'] });

    expect(portfolioQueryService.listInstruments).toHaveBeenCalledWith([
      'instrument-1',
    ]);
  });
});
