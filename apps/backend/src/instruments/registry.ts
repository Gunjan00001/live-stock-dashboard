import type { Exchange, InstrumentSearchResult } from "@market-watch/shared-types";
import { instruments as generated, generatedAt } from "./instruments.generated.js";

export { generatedAt };

export function instrumentKey(exchange: Exchange, symbol: string): string {
  return `${exchange}:${symbol.toUpperCase()}`;
}

export function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const all: InstrumentSearchResult[] = generated;
const byKey = new Map<string, InstrumentSearchResult>();
const byToken = new Map<string, InstrumentSearchResult>();
const entries = all.map((instrument) => ({ instrument, symbol: normalize(instrument.symbol), trading: normalize(instrument.tradingSymbol), name: normalize(instrument.name) }));

for (const instrument of all) {
  byKey.set(instrumentKey(instrument.exchange, instrument.symbol), instrument);
  byToken.set(`${instrument.exchangeType}:${instrument.token}`, instrument);
}

export function allInstruments(): InstrumentSearchResult[] { return all; }

export function findByKey(key: string): InstrumentSearchResult | undefined { return byKey.get(key.toUpperCase()); }

export function findByToken(exchangeType: number, token: string): InstrumentSearchResult | undefined { return byToken.get(`${exchangeType}:${token}`); }

export function resolve(symbol: string, exchange?: Exchange): InstrumentSearchResult | undefined {
  const upper = symbol.toUpperCase();
  if (exchange) return byKey.get(`${exchange}:${upper}`);
  return byKey.get(`NSE:${upper}`) ?? byKey.get(`BSE:${upper}`);
}

function rank(needle: string, entry: { symbol: string; trading: string; name: string }): number {
  if (entry.symbol === needle) return 5;
  if (entry.symbol.startsWith(needle)) return 4;
  if (entry.trading.startsWith(needle)) return 3;
  if (entry.name.startsWith(needle)) return 2;
  if (entry.symbol.includes(needle) || entry.trading.includes(needle) || entry.name.includes(needle)) return 1;
  return 0;
}

export function search(query: string, limit = 20): InstrumentSearchResult[] {
  const needle = normalize(query);
  if (needle.length < 2) return [];
  const scored: Array<{ score: number; instrument: InstrumentSearchResult }> = [];
  for (const entry of entries) {
    const score = rank(needle, entry);
    if (score > 0) scored.push({ score, instrument: entry.instrument });
  }
  scored.sort((a, b) => b.score - a.score || a.instrument.symbol.localeCompare(b.instrument.symbol) || a.instrument.exchange.localeCompare(b.instrument.exchange));
  return scored.slice(0, Math.min(Math.max(limit, 1), 50)).map((item) => item.instrument);
}
