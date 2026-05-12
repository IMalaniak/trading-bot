import { createValidateFunction, NodeEnvironment } from '@trading-bot/common';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

interface EnvConfig {
  NODE_ENV: NodeEnvironment;
  EXTERNAL_API_FACADE_GRPC_URL: string;
  EXTERNAL_API_FACADE_METRICS_PORT: number;
  BINANCE_TESTNET: boolean;
  BINANCE_API_KEY?: string;
  BINANCE_API_SECRET?: string;
  BINANCE_DEFAULT_INTERVALS: string;
  KAFKA_BROKERS: string;
}

class EnvironmentVariables implements EnvConfig {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment;

  @IsString()
  @Matches(/^[\w.-]+(:\d+)?$/, {
    message: 'EXTERNAL_API_FACADE_GRPC_URL must be a valid host:port string',
  })
  EXTERNAL_API_FACADE_GRPC_URL: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  EXTERNAL_API_FACADE_METRICS_PORT: number;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  BINANCE_TESTNET: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  BINANCE_API_KEY?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  BINANCE_API_SECRET?: string;

  @IsString()
  @IsNotEmpty()
  BINANCE_DEFAULT_INTERVALS: string;

  @IsString()
  @IsNotEmpty()
  KAFKA_BROKERS: string;
}

export const defaultEnv: Partial<EnvConfig> = {
  NODE_ENV: NodeEnvironment.Development,
  EXTERNAL_API_FACADE_METRICS_PORT: 9103,
  BINANCE_TESTNET: true,
  BINANCE_DEFAULT_INTERVALS: '1m',
};

export const validate = createValidateFunction(
  EnvironmentVariables,
  defaultEnv,
);
