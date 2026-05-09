import { createValidateFunction, NodeEnvironment } from '@trading-bot/common';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
} from 'class-validator';

interface EnvConfig {
  NODE_ENV: NodeEnvironment;
  EXECUTION_ENGINE_DATABASE_URL: string;
  EXECUTION_ENGINE_GRPC_URL: string;
  KAFKA_BROKERS: string;
  KAFKA_CONSUMER_RETRY_MAX_ATTEMPTS: number;
  KAFKA_CONSUMER_RETRY_BASE_MS: number;
  KAFKA_CONSUMER_RETRY_MAX_MS: number;
  EXECUTION_ENGINE_METRICS_PORT: number;
}

class EnvironmentVariables implements EnvConfig {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment;

  @IsUrl(
    { protocols: ['postgresql', 'postgres'], require_tld: false },
    {
      message:
        'EXECUTION_ENGINE_DATABASE_URL must be a valid PostgreSQL connection URL',
    },
  )
  EXECUTION_ENGINE_DATABASE_URL: string;

  @IsString()
  @Matches(/^[\w.-]+(:\d+)?$/, {
    message: 'EXECUTION_ENGINE_GRPC_URL must be a valid host:port string',
  })
  EXECUTION_ENGINE_GRPC_URL: string;

  @IsString()
  @IsNotEmpty()
  KAFKA_BROKERS: string;

  @IsInt()
  @Min(1)
  KAFKA_CONSUMER_RETRY_MAX_ATTEMPTS: number;

  @IsInt()
  @Min(0)
  KAFKA_CONSUMER_RETRY_BASE_MS: number;

  @IsInt()
  @Min(0)
  KAFKA_CONSUMER_RETRY_MAX_MS: number;

  @IsInt()
  @Min(0)
  @Max(65535)
  EXECUTION_ENGINE_METRICS_PORT: number;
}

export const defaultEnv: Partial<EnvConfig> = {
  NODE_ENV: NodeEnvironment.Development,
  KAFKA_CONSUMER_RETRY_MAX_ATTEMPTS: 5,
  KAFKA_CONSUMER_RETRY_BASE_MS: 250,
  KAFKA_CONSUMER_RETRY_MAX_MS: 5000,
  EXECUTION_ENGINE_METRICS_PORT: 9102,
};

export const validate = createValidateFunction(
  EnvironmentVariables,
  defaultEnv,
);
