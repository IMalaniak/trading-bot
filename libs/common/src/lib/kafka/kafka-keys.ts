const sanitizeKeyPart = (value: string): string => value.trim();

export const instrumentKey = (venue: string, instrumentId: string): string =>
  `${sanitizeKeyPart(venue).toUpperCase()}:${sanitizeKeyPart(instrumentId)}`;

export const portfolioKey = (portfolioId: string): string =>
  sanitizeKeyPart(portfolioId);

export const riskKey = (portfolioId: string, instrumentId: string): string =>
  `${portfolioKey(portfolioId)}:${sanitizeKeyPart(instrumentId)}`;
