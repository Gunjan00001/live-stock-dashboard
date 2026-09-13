import type { Candle, Exchange, InstrumentSearchResult, MarketStatus, Quote, SearchResult, Tick } from "@market-watch/shared-types";
import { ReconnectingWebSocket, type SocketInstrument } from "./reconnecting-socket";

const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
async function get<T>(path: string): Promise<T> { const response = await fetch(`${base}${path}`, { cache: "no-store" }); if (!response.ok) throw new Error("Request failed"); return response.json() as Promise<T>; }
export const api = {
  quote: (symbol: string, exchange?: Exchange) => get<Quote>(`/api/quote/${encodeURIComponent(symbol)}${exchange ? `?exchange=${exchange}` : ""}`),
  historical: (symbol: string, range: string, exchange?: Exchange) => get<Candle[]>(`/api/historical/${encodeURIComponent(symbol)}?range=${range}${exchange ? `&exchange=${exchange}` : ""}`),
  instruments: { search: (query: string, limit = 20) => get<{ query: string; results: InstrumentSearchResult[] }>(`/api/instruments/search?q=${encodeURIComponent(query)}&limit=${limit}`) },
  search: (query: string) => get<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`),
  status: () => get<MarketStatus>("/api/market-status")
};

export function openMarketSocket(onTick: (tick: Tick) => void, onError?: () => void, onOpen?: () => void) {
  const client = new ReconnectingWebSocket(process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws", {
    onOpen: () => onOpen?.(),
    onClose: () => onError?.(),
    onMessage: (data) => {
      try { const message = JSON.parse(String(data)) as { version: 1; type: string; payload: { tick?: Tick } }; if (message.version === 1 && message.type === "tick" && message.payload.tick) onTick(message.payload.tick); } catch { return; }
    }
  });
  return { subscribe: (instruments: SocketInstrument[]) => client.subscribe(instruments), unsubscribe: (instruments: SocketInstrument[]) => client.unsubscribe(instruments), close: () => client.close() };
}
