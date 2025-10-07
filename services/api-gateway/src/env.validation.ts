import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Provision = 'provision',
}

interface EnvConfig {
  NODE_ENV: Environment;
  PORT: number;
  RISK_PORTFOLIO_GRPC_URL: string;
}

class EnvironmentVariables implements EnvConfig {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  @Min(0)
  @Max(65535)
  PORT: number;

  @IsString()
  RISK_PORTFOLIO_GRPC_URL: string;
}

export const defaultEnv: Partial<EnvConfig> = {
  NODE_ENV: Environment.Development,
  PORT: 3000,
};

export function validate(config: Record<string, unknown>) {
  // Merge defaults with actual config values. Provided env vars override defaults.
  const merged = { ...defaultEnv, ...config };

  const validatedConfig = plainToInstance(EnvironmentVariables, merged, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
