import { ApiProperty } from '@nestjs/swagger';
import { AppResponseCode } from '@trading-bot/common';

export class AppErrorResponseDto {
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];

  @ApiProperty({ enum: AppResponseCode })
  code: AppResponseCode;
}
