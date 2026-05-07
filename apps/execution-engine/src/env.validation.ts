import { createValidateFunction, NodeEnvironment } from '@trading-bot/common';
import { IsEnum, IsString } from 'class-validator';

interface EnvConfig {
  NODE_ENV: NodeEnvironment;
  EXECUTION_ENGINE_DATABASE_URL: string;
  EXECUTION_ENGINE_GRPC_URL: string;
  KAFKA_BROKERS: string;
}

class EnvironmentVariables implements EnvConfig {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment;

  @IsString()
  EXECUTION_ENGINE_DATABASE_URL: string;

  @IsString()
  EXECUTION_ENGINE_GRPC_URL: string;

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
