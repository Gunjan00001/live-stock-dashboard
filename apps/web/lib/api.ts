import type { Candle, MarketStatus, Quote, SearchResult } from "@market-watch/shared-types";
import { ReconnectingWebSocket } from "./reconnecting-socket";

const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
async function get<T>(path: string): Promise<T> { const response = await fetch(`${base}${path}`, { cache: "no-store" }); if (!response.ok) throw new Error("Request failed"); return response.json() as Promise<T>; }
export const api = { quote: (symbol: string) => get<Quote>(`/api/quote/${symbol}`), historical: (symbol: string, range: string) => get<Candle[]>(`/api/historical/${symbol}?range=${range}`), search: (query: string) => get<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`), status: () => get<MarketStatus>("/api/market-status") };

export function openMarketSocket(onTick: (quote: Quote) => void, onError?: () => void, onOpen?: () => void) {
  const client = new ReconnectingWebSocket(process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws", {
    onOpen: () => onOpen?.(),
    onClose: () => onError?.(),
    onMessage: (data) => {
      try { const message = JSON.parse(String(data)) as { version: 1; type: string; payload: { tick?: { symbol: string; exchange: "NSE" | "BSE"; timestamp: string; price: number; volume: number } } }; if (message.version === 1 && message.type === "tick" && message.payload.tick) onTick({ ...message.payload.tick, open: message.payload.tick.price, high: message.payload.tick.price, low: message.payload.tick.price, previousClose: message.payload.tick.price, change: 0, changePercent: 0, dayHigh: message.payload.tick.price, dayLow: message.payload.tick.price, week52High: message.payload.tick.price, week52Low: message.payload.tick.price }); } catch { return; }
    },
  });
  return { subscribe: (symbols: string[]) => client.subscribe(symbols), close: () => client.close() };
}
