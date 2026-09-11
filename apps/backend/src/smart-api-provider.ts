import WebSocket from "ws";
import type { Candle, HistoricalRange, Quote, Tick } from "@market-watch/shared-types";
import { findInstrument } from "./catalog.js";
import { generateTotp } from "./angelone/totp.js";
import { parseStreamFrame } from "./angelone/stream-parser.js";
import { resolveAngelInstruments, tokenToSymbol, type AngelInstrument } from "./angelone/instruments.js";
import type { PriceProvider } from "./provider.js";
import { logError } from "./logger.js";

export interface SmartApiConfig {
  apiKey: string;
  clientCode: string;
  password?: string;
  totpSecret?: string;
  macAddress?: string;
  clientLocalIp?: string;
  clientPublicIp?: string;
  baseUrl?: string;
  websocketUrl?: string;
  subscriptionMode?: 1 | 2 | 3;
  jwtToken?: string;
  feedToken?: string;
  symbolTokens?: Record<string, string>;
}

export interface ProviderOptions {
  now?: () => number;
  heartbeatMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  setTimeoutFn?: (handler: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
  setIntervalFn?: (handler: () => void, timeoutMs: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void;
}

export interface SmartApiQuoteResponse {
  status: boolean;
  message: string;
  errorcode: string;
  data?: { fetched?: SmartApiFetchedQuote[]; unfetched?: unknown[] };
}

interface SmartApiFetchedQuote {
  exchange: "NSE" | "BSE";
  tradingSymbol: string;
  symbolToken: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tradeVolume?: number;
  netChange?: number;
  percentChange?: number;
  "52WeekHigh"?: number;
  "52WeekLow"?: number;
}

interface SmartApiLoginResponse { status: boolean; message: string; data?: { jwtToken: string; feedToken: string } }

interface HttpClient { request<T>(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<T>; }
interface SmartSocket { on(event: string, handler: (...args: any[]) => void): SmartSocket; send(data: string): void; close(): void; }
type SmartSocketFactory = (url: string, options: { headers: Record<string, string> }) => SmartSocket;

const rangeDays: Record<HistoricalRange, number> = { "1D": 1, "1W": 7, "1M": 31, "1Y": 365 };

const defaultHttp: HttpClient = { async request<T>(url: string, init: { method: string; headers: Record<string, string>; body?: string }) { const response = await fetch(url, init); if (!response.ok) throw new Error(`SmartAPI HTTP ${response.status}`); return response.json() as Promise<T>; } };
const defaultSocketFactory: SmartSocketFactory = (url, options) => new WebSocket(url, options) as unknown as SmartSocket;

function isoSmartDate(date: Date) { return date.toISOString().replace("T", " ").slice(0, 16); }

export function mapQuoteResponse(symbol: string, response: SmartApiQuoteResponse): Quote {
  const value = response.data?.fetched?.[0];
  if (!response.status || !value) throw new Error(response.message || "SmartAPI quote unavailable");
  const change = value.netChange ?? value.ltp - value.close;
  return { symbol: symbol.toUpperCase(), exchange: value.exchange, timestamp: new Date().toISOString(), price: value.ltp, open: value.open, high: value.high, low: value.low, previousClose: value.close, change, changePercent: value.percentChange ?? change / value.close * 100, volume: value.tradeVolume ?? 0, dayHigh: value.high, dayLow: value.low, week52High: value["52WeekHigh"] ?? value.high, week52Low: value["52WeekLow"] ?? value.low };
}

export function mapCandleRows(rows: unknown[][]): Candle[] { return rows.map((row) => ({ time: Math.floor(new Date(String(row[0])).getTime() / 1000), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5] ?? 0) })); }

export function mapSmartTick(symbol: string, exchange: "NSE" | "BSE", value: { exchange_timestamp?: string | number; last_traded_price: number; vol_traded?: number; last_traded_quantity?: number }): Tick { const timestamp = typeof value.exchange_timestamp === "number" ? new Date(value.exchange_timestamp).toISOString() : new Date(value.exchange_timestamp ?? Date.now()).toISOString(); return { symbol: symbol.toUpperCase(), exchange, timestamp, price: value.last_traded_price > 100000 ? value.last_traded_price / 100 : value.last_traded_price, volume: value.vol_traded ?? value.last_traded_quantity ?? 0 }; }

export class SmartAPIPriceProvider implements PriceProvider {
  private jwtToken?: string;
  private feedToken?: string;
  private readonly baseUrl: string;
  private readonly websocketUrl: string;
  private readonly subscriptionMode: 1 | 2 | 3;
  private readonly instruments: Record<string, AngelInstrument>;
  private readonly reverseTokens: Record<string, string>;
  private readonly options: ProviderOptions;

  constructor(private readonly config: SmartApiConfig, private readonly http: HttpClient = defaultHttp, private readonly socketFactory: SmartSocketFactory = defaultSocketFactory, options: ProviderOptions = {}) {
    this.baseUrl = config.baseUrl ?? "https://apiconnect.angelone.in";
    this.websocketUrl = config.websocketUrl ?? "wss://smartapisocket.angelone.in/smart-stream";
    this.subscriptionMode = config.subscriptionMode ?? 2;
    this.jwtToken = config.jwtToken;
    this.feedToken = config.feedToken;
    const overrides = Object.fromEntries(Object.entries(config.symbolTokens ?? {}).map(([symbol, token]) => [symbol, { token }]));
    this.instruments = resolveAngelInstruments(overrides);
    this.reverseTokens = tokenToSymbol(this.instruments);
    this.options = options;
  }

  private authHeaders(): Record<string, string> {
    return { "Content-Type": "application/json", Accept: "application/json", "X-UserType": "USER", "X-SourceID": "WEB", "X-ClientLocalIP": this.config.clientLocalIp ?? "", "X-ClientPublicIP": this.config.clientPublicIp ?? "", "X-MACAddress": this.config.macAddress ?? "", "X-PrivateKey": this.config.apiKey };
  }

  private async authenticate() {
    if (this.jwtToken && this.feedToken) return;
    if (!this.config.password || !this.config.totpSecret) throw new Error("SmartAPI requires jwt/feed tokens or password and TOTP configuration");
    const totp = generateTotp(this.config.totpSecret, (this.options.now ?? Date.now)());
    const response = await this.http.request<SmartApiLoginResponse>(`${this.baseUrl}/rest/auth/angelbroking/user/v1/loginByPassword`, { method: "POST", headers: this.authHeaders(), body: JSON.stringify({ clientcode: this.config.clientCode, password: this.config.password, totp }) });
    if (!response.status || !response.data) throw new Error(response.message || "SmartAPI authentication failed");
    this.jwtToken = response.data.jwtToken;
    this.feedToken = response.data.feedToken;
  }

  private async request<T>(path: string, body: unknown) { try { await this.authenticate(); return await this.http.request<T>(`${this.baseUrl}${path}`, { method: "POST", headers: { ...this.authHeaders(), Authorization: `Bearer ${this.jwtToken}` }, body: JSON.stringify(body) }); } catch (error) { logError("provider", "SmartAPI request failed", { provider: "SmartAPI", path }, error); throw error; } }

  private instrumentFor(symbol: string) {
    const instrument = findInstrument(symbol);
    if (!instrument) throw new Error(`Unknown symbol: ${symbol}`);
    const angel = this.instruments[instrument.symbol];
    if (!angel) throw new Error(`Missing SmartAPI symbol token for ${symbol}`);
    return { instrument, angel };
  }

  async getQuote(symbol: string) { const { instrument, angel } = this.instrumentFor(symbol); const response = await this.request<SmartApiQuoteResponse>("/rest/secure/angelbroking/market/v1/quote", { mode: "FULL", exchangeTokens: { [instrument.exchange]: [angel.token] } }); return mapQuoteResponse(instrument.symbol, response); }

  async getHistorical(symbol: string, range: HistoricalRange) { const { instrument, angel } = this.instrumentFor(symbol); const to = new Date(); const from = new Date(to.getTime() - rangeDays[range] * 86400000); const interval = range === "1D" ? "ONE_MINUTE" : "ONE_DAY"; const response = await this.request<{ status: boolean; message: string; data?: unknown[][] }>("/rest/secure/angelbroking/historical/v1/getCandleData", { exchange: instrument.exchange, symboltoken: angel.token, interval, fromdate: isoSmartDate(from), todate: isoSmartDate(to) }); if (!response.status || !response.data) throw new Error(response.message || "SmartAPI historical data unavailable"); return mapCandleRows(response.data); }

  private sendSubscriptions(socket: SmartSocket, symbols: string[]) {
    const groups = new Map<number, string[]>();
    for (const symbol of symbols) {
      const instrument = this.instruments[symbol.toUpperCase()];
      if (!instrument) continue;
      groups.set(instrument.exchangeType, [...(groups.get(instrument.exchangeType) ?? []), instrument.token]);
    }
    if (groups.size === 0) return;
    const tokenList = [...groups].map(([exchangeType, tokens]) => ({ exchangeType, tokens }));
    socket.send(JSON.stringify({ correlationID: "market-watch", action: 1, params: { mode: this.subscriptionMode, tokenList } }));
  }

  subscribeTicks(symbols: string[], onTick: (tick: Tick) => void) {
    const schedule = this.options.setTimeoutFn ?? setTimeout;
    const cancel = this.options.clearTimeoutFn ?? clearTimeout;
    const startHeartbeat = this.options.setIntervalFn ?? setInterval;
    const stopInterval = this.options.clearIntervalFn ?? clearInterval;
    const heartbeatMs = this.options.heartbeatMs ?? 10000;
    const baseMs = this.options.backoffBaseMs ?? 1000;
    const maxMs = this.options.backoffMaxMs ?? 60000;
    let closed = false;
    let socket: SmartSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let attempt = 0;

    const clearHeartbeat = () => { if (heartbeat !== undefined) { stopInterval(heartbeat); heartbeat = undefined; } };
    const scheduleReconnect = () => {
      if (closed) return;
      const delay = Math.min(maxMs, baseMs * 2 ** attempt);
      attempt += 1;
      reconnectTimer = schedule(connect, delay);
    };
    function connect() {
      if (closed) return;
      void provider.authenticate().then(() => {
        if (closed) return;
        const active = provider.socketFactory(provider.websocketUrl, { headers: { Authorization: `Bearer ${provider.jwtToken}`, "x-api-key": provider.config.apiKey, "x-client-code": provider.config.clientCode, "x-feed-token": provider.feedToken ?? "" } });
        socket = active;
        const drop = () => {
          if (active !== socket) return;
          socket = undefined;
          clearHeartbeat();
          scheduleReconnect();
        };
        active.on("open", () => {
          if (closed || active !== socket) return;
          attempt = 0;
          provider.sendSubscriptions(active, symbols);
          clearHeartbeat();
          heartbeat = startHeartbeat(() => active.send("ping"), heartbeatMs);
        });
        active.on("message", (data: Buffer | string) => {
          if (typeof data === "string" || !Buffer.isBuffer(data)) return;
          const frame = parseStreamFrame(data);
          if (!frame) return;
          const symbol = provider.reverseTokens[frame.token];
          const instrument = symbol ? provider.instruments[symbol] : undefined;
          if (!symbol || !instrument) return;
          onTick({ symbol, exchange: instrument.exchange, timestamp: new Date(frame.timestamp).toISOString(), price: frame.price, volume: frame.volume });
        });
        active.on("error", (error: unknown) => { logError("websocket", "SmartAPI WebSocket error", { provider: "SmartAPI" }, error); drop(); });
        active.on("close", drop);
      }).catch((error) => { logError("websocket", "SmartAPI WebSocket authentication failed", { provider: "SmartAPI" }, error); scheduleReconnect(); });
    }
    const provider = this;
    connect();
    return () => { closed = true; if (reconnectTimer !== undefined) cancel(reconnectTimer); clearHeartbeat(); socket?.close(); };
  }
}
