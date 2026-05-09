import {
  createApiGatewayCorsOptions,
  DEFAULT_API_GATEWAY_CORS_ORIGINS,
  parseCorsOrigins,
} from './cors.config';

describe('API Gateway CORS config', () => {
  it('uses dashboard localhost origins by default', () => {
    expect(parseCorsOrigins(DEFAULT_API_GATEWAY_CORS_ORIGINS)).toEqual([
      'http://localhost:4200',
      'http://127.0.0.1:4200',
    ]);
  });

  it('trims and drops empty custom origins', () => {
    expect(
      parseCorsOrigins(' http://localhost:4200, , https://demo.example '),
    ).toEqual(['http://localhost:4200', 'https://demo.example']);
  });

  it('allows only dashboard REST methods and simple JSON headers', () => {
    expect(createApiGatewayCorsOptions('https://dashboard.example')).toEqual({
      origin: ['https://dashboard.example'],
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept'],
      credentials: false,
    });
  });
});
