import { BadRequestException } from '@nestjs/common';
import { AppResponseCode } from '@trading-bot/common';

import { validationPipeOptions } from './app-setup';

describe('api-gateway app setup', () => {
  it('returns validation errors with an application response code', () => {
    const exception = validationPipeOptions.exceptionFactory?.([
      {
        property: 'symbol',
        constraints: {
          isNotEmpty: 'symbol should not be empty',
        },
      },
    ]);

    expect(exception).toBeInstanceOf(BadRequestException);
    expect((exception as BadRequestException).getResponse()).toEqual({
      message: ['symbol: symbol should not be empty'],
      code: AppResponseCode.VALIDATION_FAILED,
    });
  });
});
