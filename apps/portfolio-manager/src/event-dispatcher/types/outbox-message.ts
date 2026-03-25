export interface OutboxMessageInput {
  eventId?: string;
  key: string;
  value: Uint8Array;
  headers?: Record<string, string>;
}
