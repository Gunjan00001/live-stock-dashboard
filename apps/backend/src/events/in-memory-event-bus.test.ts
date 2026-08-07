import { describe, expect, it } from "vitest";
import type { Tick } from "@market-watch/shared-types";
import { InMemoryEventBus } from "./in-memory-event-bus.js";

const tick: Tick = { symbol: "TCS", exchange: "NSE", timestamp: "2026-08-08T00:00:00.000Z", price: 3800, volume: 100 };

describe("InMemoryEventBus", () => {
  it("delivers published ticks only to the matching symbol", async () => {
    const bus = new InMemoryEventBus();
    const received: Tick[] = [];
    await bus.subscribe("TCS", (value) => { received.push(value); });
    await bus.publish("INFY", tick);
    await bus.publish("TCS", tick);
    expect(received).toEqual([tick]);
  });

  it("stops delivering after unsubscribe", async () => {
    const bus = new InMemoryEventBus();
    let received = 0;
    const unsubscribe = await bus.subscribe("TCS", () => { received += 1; });
    await unsubscribe();
    await bus.publish("TCS", tick);
    expect(received).toBe(0);
  });
});
