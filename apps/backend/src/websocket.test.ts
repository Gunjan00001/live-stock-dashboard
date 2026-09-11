import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createApp } from "./app.js";

describe("WebSocket endpoint", () => {
  it("upgrades the connection and acknowledges a subscription", async () => {
    const app = await createApp();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind to a port");
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    const ack = await new Promise<{ version: number; type: string; payload: { symbols: string[] } }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for subscription ack")), 5000);
      socket.on("open", () => socket.send(JSON.stringify({ version: 1, type: "subscribe", payload: { symbols: ["TCS"] } })));
      socket.on("message", (raw) => { clearTimeout(timeout); resolve(JSON.parse(raw.toString()) as { version: number; type: string; payload: { symbols: string[] } }); });
      socket.on("error", reject);
    });
    expect(ack).toMatchObject({ version: 1, type: "subscribed", payload: { symbols: ["TCS"] } });
    socket.close();
    await app.close();
  }, 10000);
});
