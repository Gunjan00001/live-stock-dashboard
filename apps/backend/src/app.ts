import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { ClientWsMessage, Exchange, HistoricalRange, InstrumentSearchResult, ServerWsMessage, Tick } from "@market-watch/shared-types";
import { instruments as catalog } from "./catalog.js";
import { resolveAngelInstruments } from "./angelone/instruments.js";
import { instrumentKey, resolve as resolveRegistry, search as searchRegistry } from "./instruments/registry.js";
import { SubscriptionRegistry } from "./subscriptions.js";
import { getMarketStatus, isMarketOpen } from "./calendar.js";
import { MockPriceProvider, type PriceProvider, type ProviderInstrument } from "./provider.js";
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

function parseExchange(value: unknown): Exchange | undefined {
  const upper = String(value ?? "").toUpperCase();
  return upper === "NSE" || upper === "BSE" ? upper : undefined;
}

const angelDefaults = resolveAngelInstruments();

export function defaultInstruments(): ProviderInstrument[] {
  return catalog.map((item) => {
    const angel = angelDefaults[item.symbol];
    return { exchange: item.exchange, exchangeType: angel?.exchangeType ?? (item.exchange === "NSE" ? 1 : 3), token: angel?.token ?? "", symbol: item.symbol };
  });
}

export async function createApp(provider: PriceProvider = new MockPriceProvider(), dependencies: AppDependencies = {}) {
  if (process.env.NODE_ENV === "production" && process.env.FORCE_MARKET_OPEN === "true") throw new Error("FORCE_MARKET_OPEN is not allowed in production");
  const app = Fastify({ logger: false });
  const quoteStore = dependencies.quoteStore ?? new InMemoryQuoteStore();
  const eventBus = dependencies.eventBus ?? new InMemoryEventBus();
  const clients = new Map<WebSocket, Set<string>>();
  const defaults = defaultInstruments();
  const defaultByKey = new Map(defaults.map((instrument) => [instrumentKey(instrument.exchange, instrument.symbol), instrument]));
  const defaultBySymbol = new Map(defaults.map((instrument) => [instrument.symbol, instrument]));
  const handlers = new Map<string, () => Promise<void>>();

  const resolveAny = (symbol: string, exchange?: Exchange): ProviderInstrument | undefined => {
    const upper = symbol.toUpperCase();
    if (exchange) {
      const direct = defaultByKey.get(instrumentKey(exchange, upper));
      if (direct) return direct;
    } else {
      const knownDefault = defaultBySymbol.get(upper);
      if (knownDefault) return knownDefault;
    }
    const equity = resolveRegistry(upper, exchange);
    return equity ? { exchange: equity.exchange, exchangeType: equity.exchangeType, token: equity.token, symbol: equity.symbol } : undefined;
  };

  const activate = async (instrument: ProviderInstrument) => {
    const key = instrumentKey(instrument.exchange, instrument.symbol);
    if (handlers.has(key)) return;
    const unsubscribe = await eventBus.subscribe(key, async (tick) => {
      const quote = await quoteStore.get(key);
      if (quote) await quoteStore.set(key, { ...quote, timestamp: tick.timestamp, price: tick.price, change: tick.price - quote.previousClose, changePercent: (tick.price - quote.previousClose) / quote.previousClose * 100, volume: tick.volume, dayHigh: Math.max(quote.dayHigh, tick.price), dayLow: Math.min(quote.dayLow, tick.price) });
      clients.forEach((keys, socket) => { if (keys.has(key) && socket.readyState === 1) socket.send(JSON.stringify({ version: 1, type: "tick", payload: { tick } } satisfies ServerWsMessage)); });
    });
    handlers.set(key, unsubscribe);
  };

  const deactivate = async (instrument: ProviderInstrument) => {
    const key = instrumentKey(instrument.exchange, instrument.symbol);
    const unsubscribe = handlers.get(key);
    if (unsubscribe) { await unsubscribe(); handlers.delete(key); }
  };

  const registry = new SubscriptionRegistry(defaults, {
    onActivate: (instrument) => { void activate(instrument); provider.subscribe(instrument); },
    onDeactivate: (instrument) => { void deactivate(instrument); provider.unsubscribe(instrument); }
  });

  app.register(cors, { origin: true });
  await app.register(websocket);

  app.get("/api/instruments/search", async (request) => {
    const query = String((request.query as { q?: string }).q ?? "").trim();
    const requested = Number((request.query as { limit?: string }).limit ?? 20);
    const limit = Number.isFinite(requested) ? requested : 20;
    return { query, results: searchRegistry(query, limit) };
  });

  app.get("/api/search", async (request) => searchRegistry(String((request.query as { q?: string }).q ?? ""), 20).map((item: InstrumentSearchResult) => ({ symbol: item.symbol, exchange: item.exchange, type: "EQUITY" as const, name: item.name })));

  app.get("/api/quote/:symbol", async (request, reply) => {
    const symbol = (request.params as { symbol: string }).symbol.toUpperCase();
    const instrument = resolveAny(symbol, parseExchange((request.query as { exchange?: string }).exchange));
    if (!instrument) { logError("provider", "Quote request failed", { symbol, endpoint: "/api/quote" }); return reply.code(404).send({ error: "Symbol not found" }); }
    const key = instrumentKey(instrument.exchange, instrument.symbol);
    try { const quote = await quoteStore.get(key) ?? await provider.getQuote(instrument.symbol, instrument.exchange); await quoteStore.set(key, quote); return quote; } catch (error) { logError("provider", "Quote request failed", { symbol, endpoint: "/api/quote" }, error); return reply.code(404).send({ error: "Symbol not found" }); }
  });

  app.get("/api/historical/:symbol", async (request, reply) => {
    const symbol = (request.params as { symbol: string }).symbol.toUpperCase();
    const range = ((request.query as { range?: string }).range ?? "1D") as HistoricalRange;
    if (!["1D", "1W", "1M", "1Y"].includes(range)) return reply.code(400).send({ error: "Invalid range" });
    const instrument = resolveAny(symbol, parseExchange((request.query as { exchange?: string }).exchange));
    if (!instrument) return reply.code(404).send({ error: "Symbol not found" });
    try { return await provider.getHistorical(instrument.symbol, range, instrument.exchange); } catch (error) { logError("provider", "Historical request failed", { symbol, range, endpoint: "/api/historical" }, error); return reply.code(404).send({ error: "Symbol not found" }); }
  });

  app.get("/api/market-status", async () => getMarketStatus());

  app.get("/ws", { websocket: true }, (socket) => {
    const clientId = randomUUID();
    clients.set(socket, new Set());
    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as ClientWsMessage;
        if (message.version !== 1 || !["subscribe", "unsubscribe"].includes(message.type)) throw new Error("Unsupported WebSocket message");
        const subscribing = message.type === "subscribe";
        const requestedInstruments = message.payload.instruments ?? [];
        const requestedSymbols = message.payload.symbols ?? [];
        if (!requestedInstruments.length && !requestedSymbols.length) throw new Error("No instruments requested");
        const resolved: ProviderInstrument[] = [];
        for (const item of requestedInstruments) { const instrument = resolveAny(item.symbol, parseExchange(item.exchange)); if (instrument) resolved.push(instrument); }
        for (const symbol of requestedSymbols) { const instrument = resolveAny(symbol); if (instrument) resolved.push(instrument); }
        const subscriptions = clients.get(socket);
        if (!subscriptions) return;
        for (const instrument of resolved) {
          const key = instrumentKey(instrument.exchange, instrument.symbol);
          if (subscribing) { subscriptions.add(key); registry.add(clientId, instrument); }
          else { subscriptions.delete(key); registry.remove(clientId, instrument); }
        }
        const legacy = !requestedInstruments.length && requestedSymbols.length > 0;
        const payload = legacy ? { symbols: resolved.map((instrument) => instrument.symbol) } : { instruments: resolved.map((instrument) => ({ exchange: instrument.exchange, symbol: instrument.symbol })) };
        const response = { version: 1, type: subscribing ? "subscribed" : "unsubscribed", payload } satisfies ServerWsMessage;
        socket.send(JSON.stringify(response));
      } catch (error) {
        logError("websocket", "Client message rejected", { endpoint: "/ws" }, error);
        socket.send(JSON.stringify({ version: 1, type: "error", payload: { message: error instanceof Error ? error.message : "Invalid message" } } satisfies ServerWsMessage));
      }
    });
    socket.on("close", () => { clients.delete(socket); registry.removeClient(clientId); });
  });

  const forceOpen = process.env.NODE_ENV !== "production" && process.env.FORCE_MARKET_OPEN === "true";
  for (const instrument of defaults) await activate(instrument);
  const unsubscribe = provider.subscribeTicks(defaults.map((instrument) => instrument.symbol), (tick: Tick) => { if (!forceOpen && !isMarketOpen()) return; const key = instrumentKey(tick.exchange, tick.symbol); void eventBus.publish(key, tick).catch((error) => logError("ingestion", "Tick publish failed", { symbol: tick.symbol, provider: provider.constructor.name }, error)); });

  app.addHook("onClose", async () => { unsubscribe(); for (const unsubscribeHandler of handlers.values()) await unsubscribeHandler(); handlers.clear(); await eventBus.close(); await quoteStore.close(); });
  return app;
}
