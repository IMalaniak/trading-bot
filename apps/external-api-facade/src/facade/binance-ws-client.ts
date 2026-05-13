import WebSocket from 'ws';

export interface ParsedBar {
  symbol: string;
  venue: string;
  interval: string;
  openTimeMs: number;
  closeTimeMs: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quoteVolume: string;
  tradeCount: number;
  isFinal: boolean;
}

export interface BinanceKlineEvent {
  e: string;
  E: number;
  s: string;
  k: {
    t: number;
    T: number;
    s: string;
    i: string;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    q: string;
    n: number;
    x: boolean;
  };
}

export type OnBarFn = (bar: ParsedBar, venue: string) => void;

const BINANCE_TESTNET_WS_BASE = 'wss://testnet.binance.vision/ws';
const BINANCE_PRODUCTION_WS_BASE = 'wss://stream.binance.com:9443/ws';

export interface BinanceWebSocketClientOptions {
  testnet: boolean;
  /** Injected factory for unit testing. Defaults to constructing a real `ws` WebSocket. */
  wsFactory?: (url: string) => WebSocket;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
}

/**
 * BinanceWebSocketClient manages a single kline stream WebSocket connection
 * to the Binance (testnet or production) streaming API.
 *
 * Responsibilities:
 *  - Build the stream URL from symbol and interval.
 *  - Parse raw kline events into the internal ParsedBar shape.
 *  - Reconnect with capped exponential backoff on unexpected closes.
 *  - Call the provided onBar callback only for closed/final bars by default;
 *    in-progress bars are also forwarded to allow downstream filtering.
 */
export class BinanceWebSocketClient {
  /** Exposed so tests can read the injected factory type. */
  readonly wsFactory: (url: string) => WebSocket;

  private readonly testnet: boolean;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;

  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private closed = false;

  // stored to enable reconnect
  private currentSymbol: string | null = null;
  private currentInterval: string | null = null;
  private currentOnBar: OnBarFn | null = null;
  private currentVenue: string | null = null;

  constructor(options: BinanceWebSocketClientOptions) {
    this.testnet = options.testnet;
    this.reconnectBaseMs = options.reconnectBaseMs ?? 1_000;
    this.reconnectMaxMs = options.reconnectMaxMs ?? 30_000;
    this.wsFactory = options.wsFactory ?? ((url: string) => new WebSocket(url));
  }

  connect(
    symbol: string,
    interval: string,
    onBar: OnBarFn,
    venue = 'BINANCE',
  ): void {
    this.closed = false;
    this.currentSymbol = symbol;
    this.currentInterval = interval;
    this.currentOnBar = onBar;
    this.currentVenue = venue;
    this.openSocket(symbol, interval, onBar, venue);
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws !== null) {
      this.ws.close();
      this.ws = null;
    }
  }

  private openSocket(
    symbol: string,
    interval: string,
    onBar: OnBarFn,
    venue: string,
  ): void {
    const base = this.testnet
      ? BINANCE_TESTNET_WS_BASE
      : BINANCE_PRODUCTION_WS_BASE;
    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
    const url = `${base}/${streamName}`;

    const ws = this.wsFactory(url);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectAttempt = 0;
    });

    ws.on('message', (data: WebSocket.RawData) => {
      try {
        const raw = Array.isArray(data)
          ? Buffer.concat(data).toString('utf8')
          : data instanceof ArrayBuffer
            ? Buffer.from(new Uint8Array(data)).toString('utf8')
            : data.toString('utf8');
        const event: BinanceKlineEvent = JSON.parse(raw) as BinanceKlineEvent;
        if (event.e !== 'kline') return;
        const bar = this.parseEvent(event, venue);
        onBar(bar, venue);
      } catch {
        // Malformed message — swallow and continue
      }
    });

    ws.on('close', () => {
      if (!this.closed) {
        this.scheduleReconnect(symbol, interval, onBar, venue);
      }
    });

    ws.on('error', () => {
      // Error will trigger close; reconnect is handled there
    });
  }

  private scheduleReconnect(
    symbol: string,
    interval: string,
    onBar: OnBarFn,
    venue: string,
  ): void {
    const delayMs = Math.min(
      this.reconnectBaseMs * Math.pow(2, this.reconnectAttempt),
      this.reconnectMaxMs,
    );
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      if (!this.closed) {
        this.openSocket(symbol, interval, onBar, venue);
      }
    }, delayMs);
  }

  private parseEvent(event: BinanceKlineEvent, venue: string): ParsedBar {
    const k = event.k;
    return {
      symbol: k.s,
      venue,
      interval: k.i,
      openTimeMs: k.t,
      closeTimeMs: k.T,
      open: k.o,
      high: k.h,
      low: k.l,
      close: k.c,
      volume: k.v,
      quoteVolume: k.q,
      tradeCount: k.n,
      isFinal: k.x,
    };
  }
}
