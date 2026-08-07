import { createClient } from "redis";
import type { Quote } from "@market-watch/shared-types";
import type { QuoteStore } from "./quote-store.js";
import { logError } from "../logger.js";

type Client = ReturnType<typeof createClient>;

export class RedisQuoteStore implements QuoteStore {
  private constructor(private readonly client: Client) {}

  static async connect(url: string) {
    const client = createClient({ url });
    client.on("error", (error) => logError("redis", "Quote store connection error", {}, error));
    await client.connect();
    return new RedisQuoteStore(client);
  }

  async get(symbol: string) {
    const value = await this.client.get(`market:quote:${symbol.toUpperCase()}`);
    return value ? JSON.parse(value) as Quote : undefined;
  }

  async set(symbol: string, quote: Quote) {
    await this.client.set(`market:quote:${symbol.toUpperCase()}`, JSON.stringify(quote));
  }

  async close() { if (this.client.isOpen) await this.client.quit(); }
}
