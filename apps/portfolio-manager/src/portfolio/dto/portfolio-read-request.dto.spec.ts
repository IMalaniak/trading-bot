import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  GetPortfolioRequestDto,
  ListInstrumentsRequestDto,
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
});
