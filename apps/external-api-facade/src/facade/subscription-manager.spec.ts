import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SubscriptionManager } from './subscription-manager';

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;
  const startFn = vi.fn().mockResolvedValue(undefined);
  const stopFn = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SubscriptionManager(startFn, stopFn);
  });

  describe('subscribe', () => {
    it('should call startFn with the given parameters', async () => {
      await manager.subscribe('inst-1', 'BTCUSDT', 'BINANCE', ['1m']);

      expect(startFn).toHaveBeenCalledOnce();
      expect(startFn).toHaveBeenCalledWith('inst-1', 'BTCUSDT', 'BINANCE', [
        '1m',
      ]);
    });

    it('should not call startFn again for an already-subscribed instrument', async () => {
      await manager.subscribe('inst-1', 'BTCUSDT', 'BINANCE', ['1m']);
      await manager.subscribe('inst-1', 'BTCUSDT', 'BINANCE', ['1m']);

      expect(startFn).toHaveBeenCalledOnce();
    });

    it('should allow subscribing different instruments independently', async () => {
      await manager.subscribe('inst-1', 'BTCUSDT', 'BINANCE', ['1m']);
      await manager.subscribe('inst-2', 'ETHUSDT', 'BINANCE', ['1m']);

      expect(startFn).toHaveBeenCalledTimes(2);
    });

    it('should track the subscription as active after subscribing', async () => {
      await manager.subscribe('inst-1', 'BTCUSDT', 'BINANCE', ['1m']);

      expect(manager.isSubscribed('inst-1')).toBe(true);
    });
  });

  describe('unsubscribe', () => {
    it('should call stopFn for an active subscription', async () => {
      await manager.subscribe('inst-1', 'BTCUSDT', 'BINANCE', ['1m']);
      await manager.unsubscribe('inst-1');

      expect(stopFn).toHaveBeenCalledOnce();
      expect(stopFn).toHaveBeenCalledWith('inst-1');
    });

    it('should not call stopFn when instrument is not subscribed', async () => {
      await manager.unsubscribe('inst-unknown');

      expect(stopFn).not.toHaveBeenCalled();
    });

    it('should mark the subscription as inactive after unsubscribing', async () => {
      await manager.subscribe('inst-1', 'BTCUSDT', 'BINANCE', ['1m']);
      await manager.unsubscribe('inst-1');

      expect(manager.isSubscribed('inst-1')).toBe(false);
    });

    it('should allow re-subscribing after unsubscribing', async () => {
      await manager.subscribe('inst-1', 'BTCUSDT', 'BINANCE', ['1m']);
      await manager.unsubscribe('inst-1');
      await manager.subscribe('inst-1', 'BTCUSDT', 'BINANCE', ['1m']);

      expect(startFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('isSubscribed', () => {
    it('should return false for an unknown instrument', () => {
      expect(manager.isSubscribed('unknown')).toBe(false);
    });
  });

  describe('activeSubscriptions', () => {
    it('should return instrument ids of all active subscriptions', async () => {
      await manager.subscribe('inst-1', 'BTCUSDT', 'BINANCE', ['1m']);
      await manager.subscribe('inst-2', 'ETHUSDT', 'BINANCE', ['1m']);

      const active = manager.activeSubscriptions();
      expect(active).toHaveLength(2);
      expect(active).toContain('inst-1');
      expect(active).toContain('inst-2');
    });

    it('should not include unsubscribed instruments', async () => {
      await manager.subscribe('inst-1', 'BTCUSDT', 'BINANCE', ['1m']);
      await manager.subscribe('inst-2', 'ETHUSDT', 'BINANCE', ['1m']);
      await manager.unsubscribe('inst-1');

      const active = manager.activeSubscriptions();
      expect(active).toHaveLength(1);
      expect(active).toContain('inst-2');
    });
  });
});
