import type { Quote } from "@market-watch/shared-types";
import type { QuoteStore } from "./quote-store.js";

export class InMemoryQuoteStore implements QuoteStore {
  private readonly quotes = new Map<string, Quote>();

  async get(symbol: string) { return this.quotes.get(symbol.toUpperCase()); }
  async set(symbol: string, quote: Quote) { this.quotes.set(symbol.toUpperCase(), quote); }
  async close() { this.quotes.clear(); }
}
