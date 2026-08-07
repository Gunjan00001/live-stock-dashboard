import { createClient } from "redis";
import type { Tick } from "@market-watch/shared-types";
import type { EventBus, TickHandler } from "./event-bus.js";
import { logError } from "../logger.js";

type Client = ReturnType<typeof createClient>;

export class RedisEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<TickHandler>>();
  private constructor(private readonly publisher: Client, private readonly subscriber: Client) {}

  static async connect(url: string) {
    const publisher = createClient({ url });
    const subscriber = publisher.duplicate();
    publisher.on("error", (error) => logError("redis", "Event publisher connection error", {}, error));
    subscriber.on("error", (error) => logError("redis", "Event subscriber connection error", {}, error));
    await Promise.all([publisher.connect(), subscriber.connect()]);
    return new RedisEventBus(publisher, subscriber);
  }

  async publish(symbol: string, tick: Tick) {
    await this.publisher.publish(`market:ticks:${symbol.toUpperCase()}`, JSON.stringify(tick));
  }

  async subscribe(symbol: string, handler: TickHandler) {
    const key = symbol.toUpperCase();
    let handlers = this.handlers.get(key);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(key, handlers);
      await this.subscriber.subscribe(`market:ticks:${key}`, async (payload) => {
        const tick = JSON.parse(payload) as Tick;
        await Promise.all([...this.handlers.get(key) ?? []].map((listener) => Promise.resolve(listener(tick)).catch((error) => logError("redis", "Tick handler failed", { symbol: key }, error))));
      });
    }
    handlers.add(handler);
    return async () => {
      const current = this.handlers.get(key);
      current?.delete(handler);
      if (current && current.size === 0) {
        this.handlers.delete(key);
        await this.subscriber.unsubscribe(`market:ticks:${key}`);
      }
    };
  }

  async close() {
    if (this.subscriber.isOpen) await this.subscriber.quit();
    if (this.publisher.isOpen) await this.publisher.quit();
  }
}
