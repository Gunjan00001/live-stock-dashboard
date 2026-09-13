export interface SocketInstrument {
  exchange: string;
  symbol: string;
}

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
}

export interface ReconnectOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onMessage?: (data: unknown) => void;
  createSocket?: (url: string) => SocketLike;
  setTimeoutFn?: (handler: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
}

const OPEN = 1;

function keyOf(instrument: SocketInstrument) { return `${instrument.exchange}:${instrument.symbol.toUpperCase()}`; }

function defaultCreateSocket(url: string): SocketLike {
  return new WebSocket(url) as unknown as SocketLike;
}

export class ReconnectingWebSocket {
  private readonly url: string;
  private readonly options: ReconnectOptions;
  private readonly subscriptions = new Map<string, SocketInstrument>();
  private attempt = 0;
  private socket?: SocketLike;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;

  constructor(url: string, options: ReconnectOptions = {}) {
    this.url = url;
    this.options = options;
    this.connect();
  }

  subscribe(instruments: SocketInstrument[]) {
    for (const instrument of instruments) this.subscriptions.set(keyOf(instrument), instrument);
    this.flushSubscriptions();
  }

  unsubscribe(instruments: SocketInstrument[]) {
    for (const instrument of instruments) this.subscriptions.delete(keyOf(instrument));
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN || instruments.length === 0) return;
    socket.send(JSON.stringify({ version: 1, type: "unsubscribe", payload: { instruments } }));
  }

  close() {
    this.closed = true;
    if (this.timer !== undefined) { (this.options.clearTimeoutFn ?? clearTimeout)(this.timer); this.timer = undefined; }
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }

  private connect() {
    if (this.closed) return;
    let socket: SocketLike;
    try { socket = (this.options.createSocket ?? defaultCreateSocket)(this.url); } catch { this.scheduleReconnect(); return; }
    this.socket = socket;
    let dropped = false;
    const drop = () => {
      if (dropped || this.closed || socket !== this.socket) return;
      dropped = true;
      this.socket = undefined;
      socket.close();
      this.options.onClose?.();
      this.scheduleReconnect();
    };
    socket.onopen = () => {
      if (this.closed || socket !== this.socket) return;
      this.attempt = 0;
      this.options.onOpen?.();
      this.flushSubscriptions();
    };
    socket.onmessage = (event) => { if (socket === this.socket) this.options.onMessage?.(event.data); };
    socket.onerror = drop;
    socket.onclose = drop;
  }

  private flushSubscriptions() {
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN || this.subscriptions.size === 0) return;
    socket.send(JSON.stringify({ version: 1, type: "subscribe", payload: { instruments: [...this.subscriptions.values()] } }));
  }

  private scheduleReconnect() {
    if (this.closed) return;
    const base = this.options.baseDelayMs ?? 1000;
    const max = this.options.maxDelayMs ?? 30000;
    const factor = this.options.factor ?? 2;
    const delay = Math.min(max, base * factor ** this.attempt);
    this.attempt += 1;
    const schedule = this.options.setTimeoutFn ?? setTimeout;
    this.timer = schedule(() => { this.timer = undefined; this.connect(); }, delay);
  }
}
