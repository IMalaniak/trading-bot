import { createValidateFunction, NodeEnvironment } from '@trading-bot/common';
import { IsEnum, IsNumber, IsString, Max, Min } from 'class-validator';

interface EnvConfig {
  NODE_ENV: NodeEnvironment;
  PORTFOLIO_MANAGER_GRPC_URL: string;
  DATABASE_URL: string;
  KAFKA_BROKERS: string;
  KAFKA_CONSUMER_RETRY_MAX_ATTEMPTS: number;
  KAFKA_CONSUMER_RETRY_BASE_MS: number;
  KAFKA_CONSUMER_RETRY_MAX_MS: number;
  PORTFOLIO_MANAGER_METRICS_PORT: number;
}

class EnvironmentVariables implements EnvConfig {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment;

  @IsString()
  PORTFOLIO_MANAGER_GRPC_URL: string;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  KAFKA_BROKERS: string;

  @IsNumber()
  @Min(1)
  KAFKA_CONSUMER_RETRY_MAX_ATTEMPTS: number;

  @IsNumber()
  @Min(0)
  KAFKA_CONSUMER_RETRY_BASE_MS: number;

  @IsNumber()
  @Min(0)
  KAFKA_CONSUMER_RETRY_MAX_MS: number;

  @IsNumber()
  @Min(0)
  @Max(65535)
  PORTFOLIO_MANAGER_METRICS_PORT: number;
}

export const defaultEnv: Partial<EnvConfig> = {
  NODE_ENV: NodeEnvironment.Development,
  KAFKA_CONSUMER_RETRY_MAX_ATTEMPTS: 5,
  KAFKA_CONSUMER_RETRY_BASE_MS: 250,
  KAFKA_CONSUMER_RETRY_MAX_MS: 5000,
  PORTFOLIO_MANAGER_METRICS_PORT: 9101,
};

export const validate = createValidateFunction(
  EnvironmentVariables,
  defaultEnv,
);
