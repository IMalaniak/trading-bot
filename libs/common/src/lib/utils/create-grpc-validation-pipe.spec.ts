import { ArgumentMetadata } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

import { AppResponseCode, GrpcStatusCode } from '../const';
import { createGrpcValidationPipe } from './create-grpc-validation-pipe';

class RequiredStringDto {
  @IsString()
  @IsNotEmpty()
  value!: string;
}

class NumericDto {
  @Type(() => Number)
  @IsInt()
  limit!: number;
}

const metadataFor = (metatype: ArgumentMetadata['metatype']) =>
  ({
    type: 'custom',
    metatype,
  }) satisfies ArgumentMetadata;

describe('createGrpcValidationPipe', () => {
  it('throws RpcException with INVALID_ARGUMENT for invalid DTO payloads', async () => {
    const pipe = createGrpcValidationPipe();

    try {
      await pipe.transform({ value: '' }, metadataFor(RequiredStringDto));
      throw new Error('Expected validation to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(RpcException);
      expect((err as RpcException).getError()).toMatchObject({
        appCode: AppResponseCode.VALIDATION_FAILED,
        code: GrpcStatusCode.INVALID_ARGUMENT,
        message: 'Validation failed',
      });
    }
  });

  it('keeps DTO transformation enabled for gRPC request classes', async () => {
    const pipe = createGrpcValidationPipe();

    const result = (await pipe.transform(
      { limit: '10' },
      metadataFor(NumericDto),
    )) as NumericDto;

    expect(result).toBeInstanceOf(NumericDto);
    expect(result.limit).toBe(10);
  });
});
