import { describe, expect, it } from "vitest";
import { MockPriceProvider } from "./provider.js";

describe("mock price provider", () => {
  it("returns a stable quote shape for a known symbol", async () => {
    const quote = await new MockPriceProvider().getQuote("tcs");
    expect(quote.symbol).toBe("TCS");
    expect(quote.previousClose).toBeGreaterThan(0);
    expect(quote.high).toBeGreaterThanOrEqual(quote.price);
    expect(quote.low).toBeLessThanOrEqual(quote.price);
  });

  it("creates candles for every supported range", async () => {
    const provider = new MockPriceProvider();
    const candles = await provider.getHistorical("INFY", "1M");
    expect(candles).toHaveLength(30);
    expect(candles.every((candle) => candle.high >= candle.low)).toBe(true);
  });

  it("generates reproducible session-shaped ticks", () => {
    const first = new MockPriceProvider();
    const second = new MockPriceProvider();
    const open = new Date("2026-08-06T04:00:00.000Z");
    const close = new Date("2026-08-06T09:50:00.000Z");
    expect(first.generateTick("TCS", open).price).toBe(second.generateTick("TCS", open).price);
    expect(first.generateTick("TCS", open).volume).toBeLessThan(first.generateTick("TCS", close).volume);
  });
});
