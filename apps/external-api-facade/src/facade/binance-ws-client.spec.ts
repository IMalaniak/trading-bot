import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ParsedBar } from './binance-ws-client';
import {
  BinanceKlineEvent,
  BinanceWebSocketClient,
  OnBarFn,
} from './binance-ws-client';

/**
 * Lightweight EventEmitter-based mock for the `ws` WebSocket.
 * We only need `on`, `close`, and `readyState`.
 */
function makeMockWs() {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    on(event: string, fn: (...args: unknown[]) => void) {
      handlers[event] = [...(handlers[event] ?? []), fn];
    },
    emit(event: string, ...args: unknown[]) {
      (handlers[event] ?? []).forEach((fn) => fn(...args));
    },
    close: vi.fn(),
    readyState: 1, // OPEN
    _handlers: handlers,
  };
}

describe('BinanceWebSocketClient', () => {
  let wsFactory: ReturnType<typeof vi.fn>;
  let mockWs: ReturnType<typeof makeMockWs>;
  let onBar: ReturnType<typeof vi.fn> & OnBarFn;
  let client: BinanceWebSocketClient;

  beforeEach(() => {
    mockWs = makeMockWs();
    wsFactory = vi.fn().mockReturnValue(mockWs);
    onBar = vi.fn() as ReturnType<typeof vi.fn> & OnBarFn;
    client = new BinanceWebSocketClient({
      testnet: true,
      wsFactory: wsFactory as unknown as BinanceWebSocketClient['wsFactory'],
      reconnectBaseMs: 0,
      reconnectMaxMs: 0,
    });
  });

  describe('connect', () => {
    it('should construct the correct testnet WebSocket URL', () => {
      client.connect('BTCUSDT', '1m', onBar);

      expect(wsFactory).toHaveBeenCalledOnce();
      const url: string = wsFactory.mock.calls[0][0];
      expect(url).toContain('testnet.binance.vision');
      expect(url).toContain('btcusdt@kline_1m');
    });

    it('should construct the correct production WebSocket URL', () => {
      client = new BinanceWebSocketClient({
        testnet: false,
        wsFactory: wsFactory as unknown as BinanceWebSocketClient['wsFactory'],
        reconnectBaseMs: 0,
        reconnectMaxMs: 0,
      });
      client.connect('BTCUSDT', '1m', onBar);

      const url: string = wsFactory.mock.calls[0][0];
      expect(url).toContain('stream.binance.com');
      expect(url).toContain('btcusdt@kline_1m');
    });
  });

  describe('message handling', () => {
    it('should parse a valid kline message and invoke the onBar callback', () => {
      client.connect('BTCUSDT', '1m', onBar);

      const rawEvent: BinanceKlineEvent = {
        e: 'kline',
        E: 1_715_000_000_000,
        s: 'BTCUSDT',
        k: {
          t: 1_715_000_000_000,
          T: 1_715_000_059_999,
          s: 'BTCUSDT',
          i: '1m',
          o: '62000.00',
          h: '62100.00',
          l: '61900.00',
          c: '62050.00',
          v: '10.5',
          q: '651525.00',
          n: 150,
          x: true,
        },
      };

      mockWs.emit('message', JSON.stringify(rawEvent));

      expect(onBar).toHaveBeenCalledOnce();
      const bar = onBar.mock.calls[0][0] as ParsedBar;
      expect(bar.symbol).toBe('BTCUSDT');
      expect(bar.interval).toBe('1m');
      expect(bar.open).toBe('62000.00');
      expect(bar.close).toBe('62050.00');
      expect(bar.isFinal).toBe(true);
    });

    it('should not invoke onBar for non-kline messages', () => {
      client.connect('BTCUSDT', '1m', onBar);
      mockWs.emit('message', JSON.stringify({ e: 'other' }));
      expect(onBar).not.toHaveBeenCalled();
    });

    it('should not invoke onBar for malformed JSON', () => {
      client.connect('BTCUSDT', '1m', onBar);
      mockWs.emit('message', 'not-json{{{');
      expect(onBar).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should close the WebSocket', () => {
      client.connect('BTCUSDT', '1m', onBar);
      client.disconnect();
      expect(mockWs.close).toHaveBeenCalledOnce();
    });

    it('should be safe to call disconnect when not connected', () => {
      expect(() => client.disconnect()).not.toThrow();
    });
  });
});
