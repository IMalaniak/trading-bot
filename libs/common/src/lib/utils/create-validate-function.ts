import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

export function createValidateFunction<T extends object, V>(
  cls: ClassConstructor<T>,
  defaultEnv: V,
) {
  return function validate(config: Record<string, unknown>) {
    // Merge defaults with actual config values. Provided env vars override defaults.
    const merged = { ...defaultEnv, ...config };

    const validatedConfig = plainToInstance(cls, merged, {
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
  };
}
