/** Matches a time string in HH:MM format (e.g. "09:30", "23:59"). */
export const HHMM_TIME_PATTERN = /^\d{2}:\d{2}$/;

/** Matches a host:port string where the port is optional (e.g. "localhost:5000", "my-service"). */
export const HOST_PORT_PATTERN = /^[\w.-]+(:\d+)?$/;

/** Matches a string that represents a decimal number, with an optional fractional part. (e.g. "0", "123", "45.67", "0.001"). */
export const DECIMAL_STRING_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
