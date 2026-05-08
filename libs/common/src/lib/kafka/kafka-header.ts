type KafkaHeaderValue =
  | Buffer
  | string
  | readonly (Buffer | string)[]
  | undefined;

type KafkaHeaders = Record<string, KafkaHeaderValue> | undefined;

export const kafkaHeaderValueToString = (
  value: KafkaHeaderValue,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        Buffer.isBuffer(item) ? item.toString('utf8') : String(item),
      )
      .join(',');
  }

  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
};

export const readRequiredKafkaHeader = (
  headers: KafkaHeaders,
  name: string,
): string => {
  const value = kafkaHeaderValueToString(headers?.[name]);

  if (!value) {
    throw new Error(`Missing required Kafka header '${name}'`);
  }

  return value;
};

export const kafkaHeadersToStringRecord = (
  headers: KafkaHeaders,
): Record<string, string | undefined> =>
  Object.fromEntries(
    Object.entries(headers ?? {}).map(([name, value]) => [
      name,
      kafkaHeaderValueToString(value),
    ]),
  );

export const nextKafkaOffset = (offset: string): string =>
  (BigInt(offset) + 1n).toString();
