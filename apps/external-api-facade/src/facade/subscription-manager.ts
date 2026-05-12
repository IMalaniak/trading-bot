export type StartSubscriptionFn = (
  instrumentId: string,
  symbol: string,
  venue: string,
  intervals: string[],
) => Promise<void>;

export type StopSubscriptionFn = (instrumentId: string) => Promise<void>;

/**
 * SubscriptionManager tracks active market data subscriptions keyed by
 * instrument ID. It is intentionally framework-agnostic so it can be
 * unit-tested in isolation from NestJS and WebSocket concerns.
 */
export class SubscriptionManager {
  private readonly active = new Set<string>();

  constructor(
    private readonly startFn: StartSubscriptionFn,
    private readonly stopFn: StopSubscriptionFn,
  ) {}

  async subscribe(
    instrumentId: string,
    symbol: string,
    venue: string,
    intervals: string[],
  ): Promise<void> {
    if (this.active.has(instrumentId)) {
      return;
    }
    await this.startFn(instrumentId, symbol, venue, intervals);
    this.active.add(instrumentId);
  }

  async unsubscribe(instrumentId: string): Promise<void> {
    if (!this.active.has(instrumentId)) {
      return;
    }
    await this.stopFn(instrumentId);
    this.active.delete(instrumentId);
  }

  isSubscribed(instrumentId: string): boolean {
    return this.active.has(instrumentId);
  }

  activeSubscriptions(): string[] {
    return [...this.active];
  }
}
