import { plainToInstance } from 'class-transformer';
import { IsEnum, IsString, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Provision = 'provision',
}

interface EnvConfig {
  NODE_ENV: Environment;
  RISK_PORTFOLIO_GRPC_URL: string;
}

class EnvironmentVariables implements EnvConfig {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsString()
  RISK_PORTFOLIO_GRPC_URL: string;
}

export const defaultEnv: Partial<EnvConfig> = {
  NODE_ENV: Environment.Development,
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
