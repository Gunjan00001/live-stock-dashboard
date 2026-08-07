import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createApp } from "./app.js";
import { RedisEventBus } from "./events/redis-event-bus.js";
import { RedisQuoteStore } from "./storage/redis-quote-store.js";

const enabled = Boolean(process.env.REDIS_TEST_URL);

describe.skipIf(!enabled)("Redis-backed WebSocket path", () => {
  it("delivers an ingestion tick to a subscribed WebSocket client", async () => {
    const previousForce = process.env.FORCE_MARKET_OPEN;
    process.env.FORCE_MARKET_OPEN = "true";
    const quoteStore = await RedisQuoteStore.connect(process.env.REDIS_TEST_URL!);
    const eventBus = await RedisEventBus.connect(process.env.REDIS_TEST_URL!);
    const app = await createApp(undefined, { quoteStore, eventBus });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind to a port");
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    const tick = await new Promise<{ version: number; type: string; payload: { tick: { symbol: string } } }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for Redis-backed tick")), 6000);
      socket.on("open", () => socket.send(JSON.stringify({ version: 1, type: "subscribe", payload: { symbols: ["TCS"] } })));
      socket.on("message", (raw) => { const message = JSON.parse(raw.toString()) as { type: string; version: number; payload: { tick: { symbol: string } } }; if (message.type === "tick") { clearTimeout(timeout); resolve(message); } });
      socket.on("error", reject);
    });
    expect(tick).toMatchObject({ version: 1, type: "tick", payload: { tick: { symbol: "TCS" } } });
    socket.close();
    await app.close();
    if (previousForce === undefined) delete process.env.FORCE_MARKET_OPEN; else process.env.FORCE_MARKET_OPEN = previousForce;
  }, 10000);
});
