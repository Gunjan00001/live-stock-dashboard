import type { Quote } from "@market-watch/shared-types";

export interface QuoteStore {
  get(symbol: string): Promise<Quote | undefined>;
  set(symbol: string, quote: Quote): Promise<void>;
  close(): Promise<void>;
}
