import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { ClientWsMessage, HistoricalRange, ServerWsMessage, Tick } from "@market-watch/shared-types";
import { findInstrument, instruments, searchInstruments } from "./catalog.js";
import { getMarketStatus, isMarketOpen } from "./calendar.js";
import { MockPriceProvider, type PriceProvider } from "./provider.js";
import type { WebSocket } from "ws";
import type { QuoteStore } from "./storage/quote-store.js";
import { InMemoryQuoteStore } from "./storage/in-memory-quote-store.js";
import type { EventBus } from "./events/event-bus.js";
import { InMemoryEventBus } from "./events/in-memory-event-bus.js";
import { logError } from "./logger.js";

export interface AppDependencies {
  quoteStore?: QuoteStore;
  eventBus?: EventBus;
}

export async function createApp(provider: PriceProvider = new MockPriceProvider(), dependencies: AppDependencies = {}) {
  if (process.env.NODE_ENV === "production" && process.env.FORCE_MARKET_OPEN === "true") throw new Error("FORCE_MARKET_OPEN is not allowed in production");
  const app = Fastify({ logger: false });
  const quoteStore = dependencies.quoteStore ?? new InMemoryQuoteStore();
  const eventBus = dependencies.eventBus ?? new InMemoryEventBus();
  const clients = new Map<WebSocket, Set<string>>();
  app.register(cors, { origin: true });
  await app.register(websocket);
  app.get("/api/quote/:symbol", async (request, reply) => { const symbol = (request.params as { symbol: string }).symbol.toUpperCase(); try { const quote = await quoteStore.get(symbol) ?? await provider.getQuote(symbol); await quoteStore.set(symbol, quote); return quote; } catch (error) { logError("provider", "Quote request failed", { symbol, endpoint: "/api/quote" }, error); return reply.code(404).send({ error: "Symbol not found" }); } });
  app.get("/api/historical/:symbol", async (request, reply) => { const params = request.params as { symbol: string }; const range = ((request.query as { range?: string }).range ?? "1D") as HistoricalRange; if (!["1D", "1W", "1M", "1Y"].includes(range)) return reply.code(400).send({ error: "Invalid range" }); try { return await provider.getHistorical(params.symbol, range); } catch (error) { logError("provider", "Historical request failed", { symbol: params.symbol.toUpperCase(), range, endpoint: "/api/historical" }, error); return reply.code(404).send({ error: "Symbol not found" }); } });
  app.get("/api/search", async (request) => searchInstruments((request.query as { q?: string }).q ?? ""));
  app.get("/api/market-status", async () => getMarketStatus());
  app.get("/ws", { websocket: true }, (socket) => {
    clients.set(socket, new Set());
    socket.on("message", (raw) => { try { const message = JSON.parse(raw.toString()) as ClientWsMessage; if (message.version !== 1 || !["subscribe", "unsubscribe"].includes(message.type)) throw new Error("Unsupported WebSocket message"); const symbols = (message.payload.symbols ?? []).map((symbol) => symbol.toUpperCase()).filter((symbol) => Boolean(findInstrument(symbol))); const subscriptions = clients.get(socket); if (!subscriptions) return; symbols.forEach((symbol) => message.type === "subscribe" ? subscriptions.add(symbol) : subscriptions.delete(symbol)); const response: ServerWsMessage = { version: 1, type: message.type === "subscribe" ? "subscribed" : "unsubscribed", payload: { symbols } }; socket.send(JSON.stringify(response)); } catch (error) { logError("websocket", "Client message rejected", { endpoint: "/ws" }, error); socket.send(JSON.stringify({ version: 1, type: "error", payload: { message: error instanceof Error ? error.message : "Invalid message" } } satisfies ServerWsMessage)); } });
    socket.on("close", () => clients.delete(socket));
  });
  const forceOpen = process.env.NODE_ENV !== "production" && process.env.FORCE_MARKET_OPEN === "true";
  const busUnsubscribers = await Promise.all(instruments.map((instrument) => eventBus.subscribe(instrument.symbol, async (tick) => { const quote = await quoteStore.get(tick.symbol); if (quote) await quoteStore.set(tick.symbol, { ...quote, timestamp: tick.timestamp, price: tick.price, change: tick.price - quote.previousClose, changePercent: (tick.price - quote.previousClose) / quote.previousClose * 100, volume: tick.volume, dayHigh: Math.max(quote.dayHigh, tick.price), dayLow: Math.min(quote.dayLow, tick.price) }); clients.forEach((symbols, socket) => { if (symbols.has(tick.symbol) && socket.readyState === 1) socket.send(JSON.stringify({ version: 1, type: "tick", payload: { tick } } satisfies ServerWsMessage)); }); })));
  const unsubscribe = provider.subscribeTicks(instruments.map((item) => item.symbol), (tick: Tick) => { if (!forceOpen && !isMarketOpen()) return; void eventBus.publish(tick.symbol, tick).catch((error) => logError("ingestion", "Tick publish failed", { symbol: tick.symbol, provider: provider.constructor.name }, error)); });
  app.addHook("onClose", async () => { unsubscribe(); await Promise.all(busUnsubscribers.map((unsubscribeBus) => unsubscribeBus())); await eventBus.close(); await quoteStore.close(); });
  return app;
}
