import WebSocket from "ws";
import type { Candle, HistoricalRange, Quote, Tick } from "@market-watch/shared-types";
import { findInstrument } from "./catalog.js";
import type { PriceProvider } from "./provider.js";
import { logError } from "./logger.js";

export interface SmartApiConfig {
  apiKey: string;
  clientCode: string;
  password?: string;
  totp?: string;
  jwtToken?: string;
  feedToken?: string;
  baseUrl?: string;
  websocketUrl?: string;
  symbolTokens: Record<string, string>;
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

interface HttpClient { request<T>(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<T>; }
interface SmartSocket { on(event: string, handler: (...args: any[]) => void): SmartSocket; send(data: string): void; close(): void; }
type SmartSocketFactory = (url: string, options: { headers: Record<string, string> }) => SmartSocket;

const rangeDays: Record<HistoricalRange, number> = { "1D": 1, "1W": 7, "1M": 31, "1Y": 365 };

const defaultHttp: HttpClient = { async request<T>(url: string, init: { method: string; headers: Record<string, string>; body?: string }) { const response = await fetch(url, init); if (!response.ok) throw new Error(`SmartAPI HTTP ${response.status}`); return response.json() as Promise<T>; } };

function isoSmartDate(date: Date) { return date.toISOString().replace("T", " ").slice(0, 16); }
function tokenFor(config: SmartApiConfig, symbol: string) { const token = config.symbolTokens[symbol.toUpperCase()]; if (!token) throw new Error(`Missing SmartAPI symbol token for ${symbol}`); return token; }

export function mapQuoteResponse(symbol: string, response: SmartApiQuoteResponse): Quote {
  const value = response.data?.fetched?.[0];
  if (!response.status || !value) throw new Error(response.message || "SmartAPI quote unavailable");
  const change = value.netChange ?? value.ltp - value.close;
  return { symbol: symbol.toUpperCase(), exchange: value.exchange, timestamp: new Date().toISOString(), price: value.ltp, open: value.open, high: value.high, low: value.low, previousClose: value.close, change, changePercent: value.percentChange ?? change / value.close * 100, volume: value.tradeVolume ?? 0, dayHigh: value.high, dayLow: value.low, week52High: value["52WeekHigh"] ?? value.high, week52Low: value["52WeekLow"] ?? value.low };
}

export function mapCandleRows(rows: unknown[][]): Candle[] { return rows.map((row) => ({ time: Math.floor(new Date(String(row[0])).getTime() / 1000), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5] ?? 0) })); }

export function mapSmartTick(symbol: string, exchange: "NSE" | "BSE", value: { exchange_timestamp?: string | number; last_traded_price: number; vol_traded?: number; last_traded_quantity?: number }): Tick { const timestamp = typeof value.exchange_timestamp === "number" ? new Date(value.exchange_timestamp).toISOString() : new Date(value.exchange_timestamp ?? Date.now()).toISOString(); return { symbol: symbol.toUpperCase(), exchange, timestamp, price: value.last_traded_price > 100000 ? value.last_traded_price / 100 : value.last_traded_price, volume: value.vol_traded ?? value.last_traded_quantity ?? 0 }; }

function decodeBinaryTick(symbol: string, exchange: "NSE" | "BSE", data: Buffer): Tick {
  const mode = data.readUInt8(0);
  const timestamp = Number(data.readBigInt64LE(35));
  const price = mode === 1 ? data.readInt32LE(43) : Number(data.readBigInt64LE(43));
  const volume = mode === 1 ? 0 : Number(data.readBigInt64LE(67));
  return mapSmartTick(symbol, exchange, { exchange_timestamp: timestamp, last_traded_price: price, vol_traded: volume });
}

export class SmartAPIPriceProvider implements PriceProvider {
  private jwtToken?: string;
  private feedToken?: string;
  private readonly http: HttpClient;
  private readonly socketFactory: SmartSocketFactory;

  constructor(private readonly config: SmartApiConfig, http: HttpClient = defaultHttp, socketFactory: SmartSocketFactory = (url, options) => new WebSocket(url, options)) { this.http = http; this.socketFactory = socketFactory; this.jwtToken = config.jwtToken; this.feedToken = config.feedToken; }

  private async authenticate() {
    if (this.jwtToken && this.feedToken) return;
    if (!this.config.password || !this.config.totp) throw new Error("SmartAPI requires jwt/feed tokens or password and TOTP configuration");
    const response = await this.http.request<{ status: boolean; message: string; data?: { jwtToken: string; feedToken: string } }>(`${this.config.baseUrl ?? "https://apiconnect.angelone.in"}/rest/auth/angelbroking/user/v1/loginByPassword`, { method: "POST", headers: { "Content-Type": "application/json", "X-PrivateKey": this.config.apiKey, "X-UserType": "USER", "X-SourceID": "WEB" }, body: JSON.stringify({ clientcode: this.config.clientCode, password: this.config.password, totp: this.config.totp }) });
    if (!response.status || !response.data) throw new Error(response.message || "SmartAPI authentication failed");
    this.jwtToken = response.data.jwtToken; this.feedToken = response.data.feedToken;
  }

  private async request<T>(path: string, body: unknown) { try { await this.authenticate(); return await this.http.request<T>(`${this.config.baseUrl ?? "https://apiconnect.angelone.in"}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "X-UserType": "USER", "X-SourceID": "WEB", "X-PrivateKey": this.config.apiKey, Authorization: `Bearer ${this.jwtToken}` }, body: JSON.stringify(body) }); } catch (error) { logError("provider", "SmartAPI request failed", { provider: "SmartAPI", path }, error); throw error; } }

  async getQuote(symbol: string) { const instrument = findInstrument(symbol); if (!instrument) throw new Error(`Unknown symbol: ${symbol}`); const response = await this.request<SmartApiQuoteResponse>("/rest/secure/angelbroking/market/v1/quote", { mode: "FULL", exchangeTokens: { [instrument.exchange]: [tokenFor(this.config, instrument.symbol)] } }); return mapQuoteResponse(instrument.symbol, response); }

  async getHistorical(symbol: string, range: HistoricalRange) { const instrument = findInstrument(symbol); if (!instrument) throw new Error(`Unknown symbol: ${symbol}`); const to = new Date(); const from = new Date(to.getTime() - rangeDays[range] * 86400000); const interval = range === "1D" ? "ONE_MINUTE" : "ONE_DAY"; const response = await this.request<{ status: boolean; message: string; data?: unknown[][] }>("/rest/secure/angelbroking/historical/v1/getCandleData", { exchange: instrument.exchange, symboltoken: tokenFor(this.config, instrument.symbol), interval, fromdate: isoSmartDate(from), todate: isoSmartDate(to) }); if (!response.status || !response.data) throw new Error(response.message || "SmartAPI historical data unavailable"); return mapCandleRows(response.data); }

  subscribeTicks(symbols: string[], onTick: (tick: Tick) => void) { let closed = false; let socket: SmartSocket | undefined; void this.authenticate().then(() => { if (closed) return; const headers = { "x-client-code": this.config.clientCode, Authorization: this.jwtToken ?? "", "x-api-key": this.config.apiKey, "x-feed-token": this.feedToken ?? "" }; socket = this.socketFactory(this.config.websocketUrl ?? "wss://smartapisocket.angelone.in/smart-stream", { headers }); socket.on("open", () => symbols.forEach((symbol) => { const instrument = findInstrument(symbol); if (!instrument) return; socket?.send(JSON.stringify({ correlationID: `market-watch-${instrument.symbol}`, action: 1, params: { mode: 2, tokenList: [{ exchangeType: instrument.exchange === "NSE" ? 1 : 3, tokens: [tokenFor(this.config, instrument.symbol)] }] } })); })).on("error", (error) => logError("provider", "SmartAPI WebSocket error", { provider: "SmartAPI" }, error)).on("message", (data: Buffer | string) => { try { const instrument = symbols.map((symbol) => findInstrument(symbol)).find(Boolean); if (!instrument) return; if (typeof data === "string" || !Buffer.isBuffer(data)) { const parsed = JSON.parse(String(data)) as { exchange_timestamp?: string | number; last_traded_price: number; vol_traded?: number; last_traded_quantity?: number }; onTick(mapSmartTick(instrument.symbol, instrument.exchange, parsed)); } else onTick(decodeBinaryTick(instrument.symbol, instrument.exchange, data)); } catch (error) { logError("provider", "SmartAPI tick packet rejected", { provider: "SmartAPI" }, error); } }); }).catch((error) => logError("provider", "SmartAPI WebSocket authentication failed", { provider: "SmartAPI" }, error)); return () => { closed = true; socket?.close(); }; }
}
