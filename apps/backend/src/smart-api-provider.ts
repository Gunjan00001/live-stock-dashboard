import WebSocket from "ws";
import type { Candle, Exchange, HistoricalRange, Quote, Tick } from "@market-watch/shared-types";
import { generateTotp } from "./angelone/totp.js";
import { parseStreamFrame } from "./angelone/stream-parser.js";
import { resolveAngelInstruments } from "./angelone/instruments.js";
import { resolve as resolveEquity } from "./instruments/registry.js";
import type { PriceProvider, ProviderInstrument } from "./provider.js";
import { logError, logInfo } from "./logger.js";

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
  resolveInstrument?: (symbol: string, exchange?: Exchange) => ProviderInstrument | undefined;
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
const TOKEN_REFRESH_MARGIN_MS = 60_000;

const defaultHttp: HttpClient = { async request<T>(url: string, init: { method: string; headers: Record<string, string>; body?: string }) { const response = await fetch(url, init); if (!response.ok) throw new Error(`SmartAPI HTTP ${response.status}`); return response.json() as Promise<T>; } };
const defaultSocketFactory: SmartSocketFactory = (url, options) => new WebSocket(url, options) as unknown as SmartSocket;
const angelDefaults = resolveAngelInstruments();

function isoSmartDate(date: Date) { return date.toISOString().replace("T", " ").slice(0, 16); }

function nextIstMidnightUtc(now: number): number {
  const ist = new Date(now + 19_800_000);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 18, 30, 0);
}

function isAuthError(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as { errorcode?: unknown; message?: unknown };
  if (record.errorcode === "AG8002" || record.errorcode === "AG8003") return true;
  const message = typeof record.message === "string" ? record.message : "";
  return /token expired|invalid token|session expired|http 401/i.test(message);
}

function defaultResolve(symbol: string, exchange: Exchange | undefined, config: SmartApiConfig): ProviderInstrument | undefined {
  const upper = symbol.toUpperCase();
  const equity = resolveEquity(upper, exchange);
  const known = angelDefaults[upper];
  const override = config.symbolTokens?.[upper];
  if (override) {
    const exchangeName: Exchange = exchange ?? equity?.exchange ?? known?.exchange ?? "NSE";
    const exchangeType = equity?.exchangeType ?? known?.exchangeType ?? (exchangeName === "NSE" ? 1 : 3);
    return { exchange: exchangeName, exchangeType, token: override, symbol: upper };
  }
  if (equity) return { exchange: equity.exchange, exchangeType: equity.exchangeType, token: equity.token, symbol: equity.symbol };
  if (!known) return undefined;
  if (exchange && known.exchange !== exchange) return undefined;
  return { exchange: known.exchange, exchangeType: known.exchangeType, token: known.token, symbol: upper };
}

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
  private tokenExpiresAt?: number;
  private readonly now: () => number;
  private readonly baseUrl: string;
  private readonly websocketUrl: string;
  private readonly subscriptionMode: 1 | 2 | 3;
  private readonly resolveInstrument: (symbol: string, exchange?: Exchange) => ProviderInstrument | undefined;
  private readonly scheduleTimer: (handler: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
  private readonly cancelTimer: (id: ReturnType<typeof setTimeout>) => void;
  private readonly startHeartbeat: (handler: () => void, timeoutMs: number) => ReturnType<typeof setInterval>;
  private readonly stopHeartbeat: (id: ReturnType<typeof setInterval>) => void;
  private readonly heartbeatMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly activeByKey = new Map<string, ProviderInstrument>();
  private readonly activeByToken = new Map<string, ProviderInstrument>();
  private tickHandler?: (tick: Tick) => void;
  private socket?: SmartSocket;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private attempt = 0;
  private stopped = true;
  private connected = false;

  constructor(private readonly config: SmartApiConfig, private readonly http: HttpClient = defaultHttp, private readonly socketFactory: SmartSocketFactory = defaultSocketFactory, options: ProviderOptions = {}) {
    this.now = options.now ?? Date.now;
    this.baseUrl = config.baseUrl ?? "https://apiconnect.angelone.in";
    this.websocketUrl = config.websocketUrl ?? "wss://smartapisocket.angelone.in/smart-stream";
    this.subscriptionMode = config.subscriptionMode ?? 2;
    this.resolveInstrument = options.resolveInstrument ?? ((symbol, exchange) => defaultResolve(symbol, exchange, config));
    this.scheduleTimer = options.setTimeoutFn ?? setTimeout;
    this.cancelTimer = options.clearTimeoutFn ?? clearTimeout;
    this.startHeartbeat = options.setIntervalFn ?? setInterval;
    this.stopHeartbeat = options.clearIntervalFn ?? clearInterval;
    this.heartbeatMs = options.heartbeatMs ?? 10000;
    this.backoffBaseMs = options.backoffBaseMs ?? 1000;
    this.backoffMaxMs = options.backoffMaxMs ?? 60000;
    this.jwtToken = config.jwtToken;
    this.feedToken = config.feedToken;
    if (this.jwtToken && this.feedToken) this.tokenExpiresAt = nextIstMidnightUtc(this.now());
  }

  private authHeaders(): Record<string, string> {
    return { "Content-Type": "application/json", Accept: "application/json", "X-UserType": "USER", "X-SourceID": "WEB", "X-ClientLocalIP": this.config.clientLocalIp ?? "", "X-ClientPublicIP": this.config.clientPublicIp ?? "", "X-MACAddress": this.config.macAddress ?? "", "X-PrivateKey": this.config.apiKey };
  }

  private hasFreshTokens(): boolean {
    return Boolean(this.jwtToken && this.feedToken && this.tokenExpiresAt !== undefined && this.now() < this.tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS);
  }

  private invalidateTokens() {
    this.jwtToken = undefined;
    this.feedToken = undefined;
    this.tokenExpiresAt = undefined;
  }

  private async authenticate(force = false) {
    if (!force && this.hasFreshTokens()) return;
    if (!this.config.password || !this.config.totpSecret) throw new Error("SmartAPI requires jwt/feed tokens or password and TOTP configuration");
    this.invalidateTokens();
    const totp = generateTotp(this.config.totpSecret, this.now());
    const response = await this.http.request<SmartApiLoginResponse>(`${this.baseUrl}/rest/auth/angelbroking/user/v1/loginByPassword`, { method: "POST", headers: this.authHeaders(), body: JSON.stringify({ clientcode: this.config.clientCode, password: this.config.password, totp }) });
    if (!response.status || !response.data) throw new Error(response.message || "SmartAPI authentication failed");
    this.jwtToken = response.data.jwtToken;
    this.feedToken = response.data.feedToken;
    this.tokenExpiresAt = nextIstMidnightUtc(this.now());
    logInfo("provider", "SmartAPI authenticated", { provider: "SmartAPI" });
  }

  private async request<T>(path: string, body: unknown, retry = true): Promise<T> {
    try {
      await this.authenticate();
      const response = await this.http.request<T>(`${this.baseUrl}${path}`, { method: "POST", headers: { ...this.authHeaders(), Authorization: `Bearer ${this.jwtToken}` }, body: JSON.stringify(body) });
      if (retry && isAuthError(response)) { this.invalidateTokens(); return this.request<T>(path, body, false); }
      return response;
    } catch (error) {
      if (retry && isAuthError(error)) { this.invalidateTokens(); return this.request<T>(path, body, false); }
      logError("provider", "SmartAPI request failed", { provider: "SmartAPI", path }, error);
      throw error;
    }
  }

  private instrumentFor(symbol: string, exchange?: Exchange) {
    const instrument = this.resolveInstrument(symbol, exchange);
    if (!instrument) throw new Error(`Unknown symbol: ${symbol}`);
    return instrument;
  }

  async getQuote(symbol: string, exchange?: Exchange) { const instrument = this.instrumentFor(symbol, exchange); const response = await this.request<SmartApiQuoteResponse>("/rest/secure/angelbroking/market/v1/quote", { mode: "FULL", exchangeTokens: { [instrument.exchange]: [instrument.token] } }); return mapQuoteResponse(symbol.toUpperCase(), response); }

  async getHistorical(symbol: string, range: HistoricalRange, exchange?: Exchange) { const instrument = this.instrumentFor(symbol, exchange); const to = new Date(); const from = new Date(to.getTime() - rangeDays[range] * 86400000); const interval = range === "1D" ? "ONE_MINUTE" : "ONE_DAY"; const response = await this.request<{ status: boolean; message: string; data?: unknown[][] }>("/rest/secure/angelbroking/historical/v1/getCandleData", { exchange: instrument.exchange, symboltoken: instrument.token, interval, fromdate: isoSmartDate(from), todate: isoSmartDate(to) }); if (!response.status || !response.data) throw new Error(response.message || "SmartAPI historical data unavailable"); return mapCandleRows(response.data); }

  private addActive(instrument: ProviderInstrument) {
    const normalized: ProviderInstrument = { exchange: instrument.exchange, exchangeType: instrument.exchangeType, token: instrument.token, symbol: instrument.symbol.toUpperCase() };
    this.activeByKey.set(`${normalized.exchange}:${normalized.symbol}`, normalized);
    this.activeByToken.set(`${normalized.exchangeType}:${normalized.token}`, normalized);
  }

  private removeActive(instrument: ProviderInstrument) {
    this.activeByKey.delete(`${instrument.exchange}:${instrument.symbol.toUpperCase()}`);
    this.activeByToken.delete(`${instrument.exchangeType}:${instrument.token}`);
  }

  private sendSubscription(instrument: ProviderInstrument, action: number) {
    if (!this.connected || !this.socket) return;
    this.socket.send(JSON.stringify({ correlationID: "market-watch", action, params: { mode: this.subscriptionMode, tokenList: [{ exchangeType: instrument.exchangeType, tokens: [instrument.token] }] } }));
  }

  private sendAllSubscriptions(socket: SmartSocket): number {
    const groups = new Map<number, string[]>();
    for (const instrument of this.activeByKey.values()) groups.set(instrument.exchangeType, [...(groups.get(instrument.exchangeType) ?? []), instrument.token]);
    const tokenList = [...groups].map(([exchangeType, tokens]) => ({ exchangeType, tokens }));
    if (!tokenList.length) return 0;
    socket.send(JSON.stringify({ correlationID: "market-watch", action: 1, params: { mode: this.subscriptionMode, tokenList } }));
    return tokenList.reduce((total, group) => total + group.tokens.length, 0);
  }

  subscribe(instrument: ProviderInstrument) { this.addActive(instrument); this.sendSubscription(instrument, 1); }

  unsubscribe(instrument: ProviderInstrument) { this.removeActive(instrument); this.sendSubscription(instrument, 0); }

  private clearHeartbeat() { if (this.heartbeat !== undefined) { this.stopHeartbeat(this.heartbeat); this.heartbeat = undefined; } }

  private scheduleReconnect() {
    if (this.stopped) return;
    const delay = Math.min(this.backoffMaxMs, this.backoffBaseMs * 2 ** this.attempt);
    this.attempt += 1;
    this.reconnectTimer = this.scheduleTimer(() => { this.reconnectTimer = undefined; this.connect(); }, delay);
  }

  private connect() {
    if (this.stopped) return;
    void this.authenticate().then(() => {
      if (this.stopped) return;
      const active = this.socketFactory(this.websocketUrl, { headers: { Authorization: `Bearer ${this.jwtToken}`, "x-api-key": this.config.apiKey, "x-client-code": this.config.clientCode, "x-feed-token": this.feedToken ?? "" } });
      this.socket = active;
      let firstTick = false;
      const drop = () => {
        if (active !== this.socket) return;
        this.socket = undefined;
        this.connected = false;
        this.clearHeartbeat();
        this.scheduleReconnect();
      };
      active.on("open", () => {
        if (this.stopped || active !== this.socket) return;
        this.attempt = 0;
        this.connected = true;
        firstTick = false;
        const tokens = this.sendAllSubscriptions(active);
        logInfo("websocket", "SmartAPI stream connected", { provider: "SmartAPI", tokens });
        this.clearHeartbeat();
        this.heartbeat = this.startHeartbeat(() => active.send("ping"), this.heartbeatMs);
      });
      active.on("message", (data: Buffer | string) => {
        if (typeof data === "string" || !Buffer.isBuffer(data)) return;
        const frame = parseStreamFrame(data);
        if (!frame) return;
        const instrument = this.activeByToken.get(`${frame.exchangeType}:${frame.token}`);
        if (!instrument) return;
        if (!firstTick) { firstTick = true; logInfo("provider", "SmartAPI first tick", { provider: "SmartAPI", symbol: instrument.symbol }); }
        this.tickHandler?.({ symbol: instrument.symbol, exchange: instrument.exchange, timestamp: new Date(frame.timestamp).toISOString(), price: frame.price, volume: frame.volume });
      });
      active.on("error", (error: unknown) => { logError("websocket", "SmartAPI WebSocket error", { provider: "SmartAPI" }, error); drop(); });
      active.on("close", (code?: number, reason?: Buffer | string) => { logInfo("websocket", "SmartAPI stream closed", { provider: "SmartAPI", code: typeof code === "number" ? code : undefined, reason: reason ? reason.toString() : undefined }); drop(); });
    }).catch((error) => { this.invalidateTokens(); logError("websocket", "SmartAPI WebSocket authentication failed", { provider: "SmartAPI" }, error); this.scheduleReconnect(); });
  }

  subscribeTicks(symbols: string[], onTick: (tick: Tick) => void) {
    this.tickHandler = onTick;
    for (const symbol of symbols) { const instrument = this.resolveInstrument(symbol); if (instrument) this.addActive(instrument); }
    this.stopped = false;
    this.connect();
    return () => {
      this.stopped = true;
      this.connected = false;
      if (this.reconnectTimer !== undefined) { this.cancelTimer(this.reconnectTimer); this.reconnectTimer = undefined; }
      this.clearHeartbeat();
      const socket = this.socket;
      this.socket = undefined;
      socket?.close();
    };
  }
}
