import { createValidateFunction, NodeEnvironment } from '@trading-bot/common';
import { IsEnum, IsString } from 'class-validator';

interface EnvConfig {
  NODE_ENV: NodeEnvironment;
  PORTFOLIO_MANAGER_GRPC_URL: string;
  DATABASE_URL: string;
  KAFKA_BROKERS: string;
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
}

export const defaultEnv: Partial<EnvConfig> = {
  NODE_ENV: NodeEnvironment.Development,
};

export const validate = createValidateFunction(
  EnvironmentVariables,
  defaultEnv,
);
