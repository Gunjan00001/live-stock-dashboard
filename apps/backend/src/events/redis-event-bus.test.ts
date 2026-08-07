import { describe, expect, it } from "vitest";
import type { Tick } from "@market-watch/shared-types";
import { RedisEventBus } from "./redis-event-bus.js";

const enabled = Boolean(process.env.REDIS_TEST_URL);
const tick: Tick = { symbol: "TCS", exchange: "NSE", timestamp: "2026-08-08T00:00:00.000Z", price: 3800, volume: 100 };

describe.skipIf(!enabled)("RedisEventBus", () => {
  it("delivers a per-symbol published tick", async () => {
    const bus = await RedisEventBus.connect(process.env.REDIS_TEST_URL!);
    const received: Tick[] = [];
    const unsubscribe = await bus.subscribe("TCS", (value) => { received.push(value); });
    await bus.publish("TCS", tick);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received).toEqual([tick]);
    await unsubscribe();
    await bus.close();
  });
});
