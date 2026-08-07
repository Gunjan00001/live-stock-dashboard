import { describe, expect, it } from "vitest";
import type { Quote } from "@market-watch/shared-types";
import { RedisQuoteStore } from "./redis-quote-store.js";

const enabled = Boolean(process.env.REDIS_TEST_URL);
const quote: Quote = { symbol: "TCS", exchange: "NSE", timestamp: "2026-08-08T00:00:00.000Z", price: 3800, open: 3790, high: 3810, low: 3780, previousClose: 3795, change: 5, changePercent: 0.13, volume: 100, dayHigh: 3810, dayLow: 3780, week52High: 4000, week52Low: 3000 };

describe.skipIf(!enabled)("RedisQuoteStore", () => {
  it("round-trips a quote by symbol", async () => {
    const store = await RedisQuoteStore.connect(process.env.REDIS_TEST_URL!);
    await store.set("phase2-test", quote);
    expect(await store.get("PHASE2-TEST")).toEqual(quote);
    await store.close();
  });
});
