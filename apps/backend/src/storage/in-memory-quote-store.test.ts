import { describe, expect, it } from "vitest";
import type { Quote } from "@market-watch/shared-types";
import { InMemoryQuoteStore } from "./in-memory-quote-store.js";

const quote: Quote = { symbol: "TCS", exchange: "NSE", timestamp: "2026-08-08T00:00:00.000Z", price: 3800, open: 3790, high: 3810, low: 3780, previousClose: 3795, change: 5, changePercent: 0.13, volume: 100, dayHigh: 3810, dayLow: 3780, week52High: 4000, week52Low: 3000 };

describe("InMemoryQuoteStore", () => {
  it("returns an absent symbol until it is written", async () => {
    expect(await new InMemoryQuoteStore().get("TCS")).toBeUndefined();
  });

  it("round-trips quotes by normalized symbol", async () => {
    const store = new InMemoryQuoteStore();
    await store.set("tcs", quote);
    expect(await store.get("TCS")).toEqual(quote);
  });
});
