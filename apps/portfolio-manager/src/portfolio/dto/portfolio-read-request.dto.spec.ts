import { AssetClass } from '@trading-bot/common/proto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  GetPortfolioRequestDto,
  ListInstrumentsRequestDto,
  RegisterPortfolioInstrumentRequestDto,
} from './portfolio-read-request.dto';

describe('portfolio read request DTOs', () => {
  it('rejects blank portfolio ids at the transport boundary', async () => {
    const dto = plainToInstance(GetPortfolioRequestDto, { portfolioId: '' });

    await expect(validate(dto)).resolves.toHaveLength(1);
  });

  it('accepts a valid portfolio id', async () => {
    const dto = plainToInstance(GetPortfolioRequestDto, {
      portfolioId: 'portfolio-alpha',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('requires instrument id lists to contain non-empty strings', async () => {
    const dto = plainToInstance(ListInstrumentsRequestDto, {
      instrumentIds: ['instrument-1', ''],
    });

    await expect(validate(dto)).resolves.toHaveLength(1);
  });

  it('validates portfolio instrument registration payloads', async () => {
    const dto = plainToInstance(RegisterPortfolioInstrumentRequestDto, {
      portfolioId: 'portfolio-alpha',
      assetClass: AssetClass.STOCK,
      symbol: 'AAPL',
      venue: 'NASDAQ',
      externalSymbol: 'AAPL',
      enabled: true,
      targetNotional: '100',
      maxTradeNotional: '25',
      maxPositionNotional: '400',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects invalid portfolio instrument notional config', async () => {
    const dto = plainToInstance(RegisterPortfolioInstrumentRequestDto, {
      portfolioId: 'portfolio-alpha',
      assetClass: AssetClass.STOCK,
      symbol: 'AAPL',
      venue: 'NASDAQ',
      enabled: true,
      targetNotional: 'one hundred',
      maxTradeNotional: '25',
      maxPositionNotional: '400',
    });

    await expect(validate(dto)).resolves.toHaveLength(1);
  });
});
