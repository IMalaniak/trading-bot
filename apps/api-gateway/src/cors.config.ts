export const DEFAULT_API_GATEWAY_CORS_ORIGINS =
  'http://localhost:4200,http://127.0.0.1:4200';

export interface ApiGatewayCorsOptions {
  origin: string[];
  methods: string[];
  allowedHeaders: string[];
  credentials: boolean;
}

export const parseCorsOrigins = (value: string): string[] =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

export const createApiGatewayCorsOptions = (
  origins: string = DEFAULT_API_GATEWAY_CORS_ORIGINS,
): ApiGatewayCorsOptions => ({
  origin: parseCorsOrigins(origins),
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  credentials: false,
});
