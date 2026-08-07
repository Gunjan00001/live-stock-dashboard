import type { Tick } from "@market-watch/shared-types";
import type { EventBus, TickHandler } from "./event-bus.js";

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<TickHandler>>();

  async publish(symbol: string, tick: Tick) { await Promise.all([...this.handlers.get(symbol.toUpperCase()) ?? []].map((handler) => handler(tick))); }

  async subscribe(symbol: string, handler: TickHandler) {
    const key = symbol.toUpperCase();
    const handlers = this.handlers.get(key) ?? new Set<TickHandler>();
    handlers.add(handler);
    this.handlers.set(key, handlers);
    return async () => { handlers.delete(handler); if (!handlers.size) this.handlers.delete(key); };
  }

  async close() { this.handlers.clear(); }
}
