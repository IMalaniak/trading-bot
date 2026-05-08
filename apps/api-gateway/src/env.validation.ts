import { createValidateFunction, NodeEnvironment } from '@trading-bot/common';
import { IsEnum, IsInt, IsString, Matches, Max, Min } from 'class-validator';

import { DEFAULT_API_GATEWAY_CORS_ORIGINS } from './cors.config';

interface EnvConfig {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  PORTFOLIO_MANAGER_GRPC_URL: string;
  EXECUTION_ENGINE_GRPC_URL: string;
  API_GATEWAY_CORS_ORIGINS: string;
}

class EnvironmentVariables implements EnvConfig {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment;

  @IsInt()
  @Min(0)
  @Max(65535)
  PORT: number;

  @IsString()
  @Matches(/^[\w.-]+(:\d+)?$/, {
    message: 'PORTFOLIO_MANAGER_GRPC_URL must be a valid host:port string',
  })
  PORTFOLIO_MANAGER_GRPC_URL: string;

  @IsString()
  @Matches(/^[\w.-]+(:\d+)?$/, {
    message: 'EXECUTION_ENGINE_GRPC_URL must be a valid host:port string',
  })
  EXECUTION_ENGINE_GRPC_URL: string;

  @IsString()
  API_GATEWAY_CORS_ORIGINS: string;
}

export const defaultEnv: Partial<EnvConfig> = {
  NODE_ENV: NodeEnvironment.Development,
  PORT: 3000,
  API_GATEWAY_CORS_ORIGINS: DEFAULT_API_GATEWAY_CORS_ORIGINS,
};

export const validate = createValidateFunction(
  EnvironmentVariables,
  defaultEnv,
);
