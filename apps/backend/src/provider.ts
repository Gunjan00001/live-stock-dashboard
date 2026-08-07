import type { Candle, HistoricalRange, Quote, Tick } from "@market-watch/shared-types";
import { findInstrument } from "./catalog.js";

export interface PriceProvider {
  getQuote(symbol: string): Promise<Quote>;
  getHistorical(symbol: string, range: HistoricalRange): Promise<Candle[]>;
  subscribeTicks(symbols: string[], onTick: (tick: Tick) => void): () => void;
}

const bases: Record<string, number> = { RELIANCE: 1420, TCS: 3875, HDFCBANK: 1710, INFY: 1840, ICICIBANK: 1240, HINDUNILVR: 2380, SBIN: 805, NIFTY50: 24400, SENSEX: 80200 };

export class MockPriceProvider implements PriceProvider {
  private prices = new Map<string, number>();
  private seeds = new Map<string, number>();
  private tickCount = new Map<string, number>();
  private random(symbol: string) { let seed = this.seeds.get(symbol) ?? [...symbol].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7); seed = (seed * 1664525 + 1013904223) >>> 0; this.seeds.set(symbol, seed); return seed / 4294967296; }
  private sessionProgress(date: Date) { const value = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result; }, {}); return Math.min(1, Math.max(0, (Number(value.hour) * 60 + Number(value.minute) - 555) / 375)); }
  private quote(symbol: string, now = new Date()): Quote {
    const instrument = findInstrument(symbol);
    if (!instrument) throw new Error(`Unknown symbol: ${symbol}`);
    const key = instrument.symbol;
    const previousClose = bases[key] ?? 100;
    const price = this.prices.get(key) ?? previousClose * (1 + ((key.length % 5) - 2) / 100);
    this.prices.set(key, price);
    const change = price - previousClose;
    return { symbol: key, exchange: instrument.exchange, timestamp: now.toISOString(), price: Number(price.toFixed(2)), open: previousClose, high: Number((price * 1.012).toFixed(2)), low: Number((price * 0.988).toFixed(2)), previousClose, change: Number(change.toFixed(2)), changePercent: Number((change / previousClose * 100).toFixed(2)), volume: Math.round(100000 + price * 20), dayHigh: Number((price * 1.012).toFixed(2)), dayLow: Number((price * 0.988).toFixed(2)), week52High: Number((price * 1.18).toFixed(2)), week52Low: Number((price * 0.72).toFixed(2)) };
  }

  async getQuote(symbol: string) { return this.quote(symbol); }

  async getHistorical(symbol: string, range: HistoricalRange) {
    if (!findInstrument(symbol)) throw new Error(`Unknown symbol: ${symbol}`);
    const count = range === "1D" ? 78 : range === "1W" ? 35 : range === "1M" ? 30 : 52;
    const base = bases[symbol.toUpperCase()] ?? 100;
    return Array.from({ length: count }, (_, index) => { const close = base * (1 + Math.sin(index / 4) / 35); const open = close * 0.998; return { time: Math.floor(Date.now() / 1000) - (count - index) * 86400, open, high: close * 1.008, low: open * 0.992, close, volume: 100000 + index * 1200 }; });
  }

  generateTick(symbol: string, now = new Date()): Tick {
    const instrument = findInstrument(symbol);
    if (!instrument) throw new Error(`Unknown symbol: ${symbol}`);
    const key = instrument.symbol;
    const base = bases[key] ?? 100;
    const current = this.prices.get(key) ?? base * (1 + ((key.length % 5) - 2) / 100);
    const count = (this.tickCount.get(key) ?? 0) + 1;
    this.tickCount.set(key, count);
    const randomMove = (this.random(key) - 0.5) * 0.0025;
    const shock = this.random(key) < 0.08 ? (this.random(key) - 0.5) * 0.018 : 0;
    const progress = this.sessionProgress(now);
    const sessionTrend = Math.sin(progress * Math.PI * 2 + key.length) * 0.0007;
    const next = current * (1 + randomMove + shock + sessionTrend);
    this.prices.set(key, next);
    const openClosePulse = 1 + 2.2 * Math.pow(Math.abs(progress - 0.5) * 2, 2);
    const volume = Math.round((base * 18 + this.random(key) * base * 30) * openClosePulse);
    return { symbol: key, exchange: instrument.exchange, timestamp: now.toISOString(), price: Number(next.toFixed(2)), volume };
  }

  subscribeTicks(symbols: string[], onTick: (tick: Tick) => void) {
    const timer = setInterval(() => symbols.forEach((symbol) => onTick(this.generateTick(symbol))), 1500);
    return () => clearInterval(timer);
  }
}

export class SmartAPIPriceProvider implements PriceProvider {
  getQuote(): Promise<Quote> { return Promise.reject(new Error("SmartAPI provider is not configured")); }
  getHistorical(): Promise<Candle[]> { return Promise.reject(new Error("SmartAPI provider is not configured")); }
  subscribeTicks(): () => void { return () => undefined; }
}
