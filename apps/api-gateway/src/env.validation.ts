import { createValidateFunction, NodeEnvironment } from '@trading-bot/common';
import { IsEnum, IsNumber, IsString, Max, Min } from 'class-validator';

interface EnvConfig {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  PORTFOLIO_MANAGER_GRPC_URL: string;
}

class EnvironmentVariables implements EnvConfig {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment;

  @IsNumber()
  @Min(0)
  @Max(65535)
  PORT: number;

  @IsString()
  PORTFOLIO_MANAGER_GRPC_URL: string;
}

export const defaultEnv: Partial<EnvConfig> = {
  NODE_ENV: NodeEnvironment.Development,
  PORT: 3000,
};

export const validate = createValidateFunction(
  EnvironmentVariables,
  defaultEnv,
);
