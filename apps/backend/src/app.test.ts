import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { Candle, Exchange, Quote, Tick } from "@market-watch/shared-types";
import { createApp } from "./app.js";
import type { PriceProvider, ProviderInstrument } from "./provider.js";

class FakeProvider implements PriceProvider {
  subscribed: ProviderInstrument[] = [];
  unsubscribed: ProviderInstrument[] = [];
  async getQuote(symbol: string, exchange?: Exchange): Promise<Quote> { return { symbol: symbol.toUpperCase(), exchange: exchange ?? "NSE", timestamp: new Date().toISOString(), price: 100, open: 99, high: 101, low: 98, previousClose: 99, change: 1, changePercent: 1, volume: 10, dayHigh: 101, dayLow: 98, week52High: 120, week52Low: 80 }; }
  async getHistorical(): Promise<Candle[]> { return []; }
  subscribeTicks(): () => void { return () => undefined; }
  subscribe(instrument: ProviderInstrument) { this.subscribed.push(instrument); }
  unsubscribe(instrument: ProviderInstrument) { this.unsubscribed.push(instrument); }
}

async function connectAndSend(port: number, message: unknown) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const reply = await new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for ack")), 5000);
    socket.on("open", () => socket.send(JSON.stringify(message)));
    socket.on("message", (raw) => { clearTimeout(timeout); resolve(JSON.parse(raw.toString())); });
    socket.on("error", reject);
  });
  socket.close();
  return reply;
}

async function listen(app: Awaited<ReturnType<typeof createApp>>) {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a port");
  return address.port;
}

describe("app contracts", () => {
  it("searches the full universe without exposing credentials", async () => {
    const app = await createApp(new FakeProvider());
    const response = await app.inject({ method: "GET", url: "/api/instruments/search?q=yes%20bank" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.results.some((item: any) => item.symbol === "YESBANK" && item.exchange === "NSE" && item.token === "11915")).toBe(true);
    expect(body.results.some((item: any) => item.symbol === "YESBANK" && item.exchange === "BSE" && item.token === "532648")).toBe(true);
    expect(response.body).not.toMatch(/api-key|privateKey|jwtToken|feedToken|totp|password/i);
    await app.close();
  });

  it("keeps the legacy /api/search alias working with an empty result", async () => {
    const app = await createApp(new FakeProvider());
    expect((await app.inject({ method: "GET", url: "/api/search?q=NOT-A-SYMBOL" })).json()).toEqual([]);
    const known = (await app.inject({ method: "GET", url: "/api/search?q=reliance" })).json();
    expect(known.some((item: any) => item.symbol === "RELIANCE")).toBe(true);
    await app.close();
  });

  it("resolves quotes and historicals per exchange", async () => {
    const app = await createApp(new FakeProvider());
    expect((await app.inject({ method: "GET", url: "/api/quote/YESBANK?exchange=BSE" })).json().exchange).toBe("BSE");
    expect((await app.inject({ method: "GET", url: "/api/quote/YESBANK?exchange=NSE" })).json().exchange).toBe("NSE");
    expect((await app.inject({ method: "GET", url: "/api/quote/NIFTY50" })).json().exchange).toBe("NSE");
    expect((await app.inject({ method: "GET", url: "/api/quote/SENSEX" })).json().exchange).toBe("BSE");
    await app.close();
  });

  it("drives ref-counted provider subscriptions over /ws with instrument acks", async () => {
    const provider = new FakeProvider();
    const app = await createApp(provider);
    const port = await listen(app);
    const ack = await connectAndSend(port, { version: 1, type: "subscribe", payload: { instruments: [{ exchange: "NSE", symbol: "YESBANK" }] } });
    expect(ack).toMatchObject({ type: "subscribed", payload: { instruments: [{ exchange: "NSE", symbol: "YESBANK" }] } });
    expect(provider.subscribed.some((instrument) => instrument.symbol === "YESBANK" && instrument.token === "11915")).toBe(true);
    const ack2 = await connectAndSend(port, { version: 1, type: "unsubscribe", payload: { instruments: [{ exchange: "NSE", symbol: "YESBANK" }] } });
    expect(ack2).toMatchObject({ type: "unsubscribed", payload: { instruments: [{ exchange: "NSE", symbol: "YESBANK" }] } });
    expect(provider.unsubscribed.some((instrument) => instrument.symbol === "YESBANK")).toBe(true);
    await app.close();
  });

  it("keeps the legacy { symbols } subscription working for defaults", async () => {
    const provider = new FakeProvider();
    const app = await createApp(provider);
    const port = await listen(app);
    const ack = await connectAndSend(port, { version: 1, type: "subscribe", payload: { symbols: ["TCS"] } });
    expect(ack).toMatchObject({ type: "subscribed", payload: { symbols: ["TCS"] } });
    const bse = await connectAndSend(port, { version: 1, type: "subscribe", payload: { symbols: ["SENSEX"] } });
    expect(bse).toMatchObject({ type: "subscribed", payload: { symbols: ["SENSEX"] } });
    await app.close();
  });
});
