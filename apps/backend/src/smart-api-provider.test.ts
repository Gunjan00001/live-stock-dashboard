import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tick } from "@market-watch/shared-types";
import { mapCandleRows, mapQuoteResponse, mapSmartTick, SmartAPIPriceProvider, type SmartApiQuoteResponse } from "./smart-api-provider.js";

class FakeSocket {
  readyState = 0;
  sent: string[] = [];
  private handlers: Record<string, ((...args: any[]) => void)[]> = {};
  on(event: string, handler: (...args: any[]) => void) { (this.handlers[event] ??= []).push(handler); return this; }
  send(data: string) { this.sent.push(data); }
  close() { this.emit("close"); }
  emit(event: string, ...args: any[]) { (this.handlers[event] ?? []).forEach((handler) => handler(...args)); }
  open() { this.readyState = 1; this.emit("open"); }
  drop() { this.emit("close"); }
  message(data: Buffer) { this.emit("message", data); }
}

const wsConfig = { apiKey: "api-key", clientCode: "client", jwtToken: "jwt", feedToken: "feed", subscriptionMode: 2 as const };
const okHttp = { request: async () => ({ status: true, message: "SUCCESS", data: { jwtToken: "jwt", feedToken: "feed" } }) as any };

function quoteBinary(token: string, ltpPaise: number, volume: number) {
  const buffer = Buffer.alloc(123);
  buffer.writeUInt8(2, 0); buffer.writeUInt8(1, 1); buffer.write(token, 2, "ascii");
  buffer.writeBigInt64LE(1_700_000_000_000n, 35); buffer.writeBigInt64LE(BigInt(ltpPaise), 43); buffer.writeBigInt64LE(BigInt(volume), 67);
  return buffer;
}

describe("SmartAPI response mapping", () => {
  it("maps the documented fetched quote fields", () => {
    const response: SmartApiQuoteResponse = { status: true, message: "SUCCESS", errorcode: "", data: { fetched: [{ exchange: "NSE", tradingSymbol: "TCS-EQ", symbolToken: "11536", ltp: 3800.5, open: 3780, high: 3820, low: 3770, close: 3790, tradeVolume: 123456, netChange: 10.5, percentChange: 0.28, "52WeekHigh": 4200, "52WeekLow": 3000 }], unfetched: [] } };
    const quote = mapQuoteResponse("TCS", response);
    expect(quote).toMatchObject({ symbol: "TCS", exchange: "NSE", price: 3800.5, previousClose: 3790, volume: 123456, week52High: 4200, week52Low: 3000 });
  });

  it("maps documented historical candle rows", () => {
    const candles = mapCandleRows([["2026-08-08T09:15:00+05:30", "100", "105", "98", "103", "1000"]]);
    expect(candles[0]).toMatchObject({ open: 100, high: 105, low: 98, close: 103, volume: 1000 });
  });

  it("maps a Smart Stream V2 JSON tick fixture", () => {
    const tick = mapSmartTick("TCS", "NSE", { exchange_timestamp: "2026-08-08T09:15:01+05:30", last_traded_price: 380050, vol_traded: 1200 });
    expect(tick).toMatchObject({ symbol: "TCS", exchange: "NSE", price: 3800.5, volume: 1200 });
  });

  it("uses the documented quote request and auth headers", async () => {
    const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const provider = new SmartAPIPriceProvider({ apiKey: "api-key", clientCode: "client", jwtToken: "jwt", feedToken: "feed", symbolTokens: { TCS: "11536" } }, { request: async <T>(url: string, init: { headers: Record<string, string>; body?: string }) => { calls.push({ url, body: init.body ?? "", headers: init.headers }); return { status: true, message: "SUCCESS", data: { fetched: [{ exchange: "NSE", tradingSymbol: "TCS-EQ", symbolToken: "11536", ltp: 3800, open: 3790, high: 3810, low: 3780, close: 3795, tradeVolume: 10 }] } } as T; } });
    await provider.getQuote("TCS");
    expect(calls[0]).toMatchObject({ url: "https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote", headers: { Authorization: "Bearer jwt", "X-PrivateKey": "api-key" } });
    expect(JSON.parse(calls[0]!.body)).toEqual({ mode: "FULL", exchangeTokens: { NSE: ["11536"] } });
  });
});

describe("SmartAPIPriceProvider streaming", () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("subscribes with mode 2 and resubscribes after a drop", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const provider = new SmartAPIPriceProvider(wsConfig, okHttp, () => { const socket = new FakeSocket(); sockets.push(socket); return socket; });
    const close = provider.subscribeTicks(["TCS"], () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(1);
    sockets[0]!.open();
    expect(JSON.parse(sockets[0]!.sent[0]!)).toMatchObject({ action: 1, params: { mode: 2, tokenList: [{ exchangeType: 1, tokens: ["11536"] }] } });
    sockets[0]!.drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    expect(sockets[1]!.sent.some((message) => message.includes("11536"))).toBe(true);
    close();
  });

  it("normalizes a binary QUOTE frame onto the catalog symbol", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const provider = new SmartAPIPriceProvider(wsConfig, okHttp, () => { const socket = new FakeSocket(); sockets.push(socket); return socket; });
    const ticks: Tick[] = [];
    const close = provider.subscribeTicks(["TCS"], (tick) => ticks.push(tick));
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.open();
    sockets[0]!.message(quoteBinary("11536", 380_050, 1200));
    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toMatchObject({ symbol: "TCS", exchange: "NSE", price: 3800.5, volume: 1200 });
    close();
  });

  it("retries instead of throwing when authentication fails", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const failing = { request: async () => ({ status: false, message: "Invalid totp" }) as any };
    const provider = new SmartAPIPriceProvider({ apiKey: "k", clientCode: "c", password: "p", totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" }, failing, () => { const socket = new FakeSocket(); sockets.push(socket); return socket; });
    const close = provider.subscribeTicks(["TCS"], () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(0);
    close();
  });

  it("caps the reconnect delay at maxMs", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const provider = new SmartAPIPriceProvider(wsConfig, okHttp, () => { const socket = new FakeSocket(); sockets.push(socket); return socket; }, { backoffBaseMs: 120000, backoffMaxMs: 60000 });
    const close = provider.subscribeTicks(["TCS"], () => {});
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.drop();
    await vi.advanceTimersByTimeAsync(59999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
    close();
  });

  it("sends dynamic subscribe and unsubscribe frames for a single token", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const provider = new SmartAPIPriceProvider(wsConfig, okHttp, () => { const socket = new FakeSocket(); sockets.push(socket); return socket; });
    const close = provider.subscribeTicks(["TCS"], () => {});
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.open();
    sockets[0]!.sent.length = 0;
    provider.subscribe({ exchange: "NSE", exchangeType: 1, token: "11915", symbol: "YESBANK" });
    expect(JSON.parse(sockets[0]!.sent[0]!)).toMatchObject({ action: 1, params: { mode: 2, tokenList: [{ exchangeType: 1, tokens: ["11915"] }] } });
    sockets[0]!.sent.length = 0;
    provider.unsubscribe({ exchange: "NSE", exchangeType: 1, token: "11915", symbol: "YESBANK" });
    expect(JSON.parse(sockets[0]!.sent[0]!)).toMatchObject({ action: 0, params: { tokenList: [{ exchangeType: 1, tokens: ["11915"] }] } });
    close();
  });

  it("re-subscribes default and dynamic instruments after reconnect", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const provider = new SmartAPIPriceProvider(wsConfig, okHttp, () => { const socket = new FakeSocket(); sockets.push(socket); return socket; });
    const close = provider.subscribeTicks(["TCS"], () => {});
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.open();
    provider.subscribe({ exchange: "NSE", exchangeType: 1, token: "11915", symbol: "YESBANK" });
    sockets[0]!.drop();
    await vi.advanceTimersByTimeAsync(1000);
    sockets[1]!.open();
    const sent = sockets[1]!.sent.join(" ");
    expect(sent).toContain("11536");
    expect(sent).toContain("11915");
    close();
  });
});

describe("SmartAPIPriceProvider token lifecycle and telemetry", () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("re-authenticates after the session expires at midnight IST", async () => {
    let currentTime = Date.UTC(2026, 8, 13, 10, 0, 0);
    const calls: string[] = [];
    const http = { request: async (url: string) => {
      calls.push(url);
      if (url.includes("loginByPassword")) return { status: true, message: "SUCCESS", data: { jwtToken: "jwt", feedToken: "feed" } } as any;
      return { status: true, message: "SUCCESS", data: { fetched: [{ exchange: "NSE", tradingSymbol: "TCS-EQ", symbolToken: "11536", ltp: 3800, open: 3790, high: 3810, low: 3780, close: 3795, tradeVolume: 10 }] } } as any;
    }};
    const provider = new SmartAPIPriceProvider({ apiKey: "k", clientCode: "c", password: "p", totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" }, http, undefined, { now: () => currentTime });
    const logins = () => calls.filter((url) => url.includes("loginByPassword")).length;
    await provider.getQuote("TCS");
    await provider.getQuote("TCS");
    expect(logins()).toBe(1);
    currentTime = Date.UTC(2026, 8, 13, 19, 0, 0);
    await provider.getQuote("TCS");
    expect(logins()).toBe(2);
  });

  it("re-authenticates and retries when a token is rejected", async () => {
    let quoteCalls = 0;
    const http = { request: async (url: string) => {
      if (url.includes("loginByPassword")) return { status: true, message: "SUCCESS", data: { jwtToken: "jwt", feedToken: "feed" } } as any;
      quoteCalls += 1;
      if (quoteCalls === 1) return { status: false, errorcode: "AG8002", message: "Token Expired" } as any;
      return { status: true, message: "SUCCESS", data: { fetched: [{ exchange: "NSE", tradingSymbol: "TCS-EQ", symbolToken: "11536", ltp: 3800, open: 3790, high: 3810, low: 3780, close: 3795, tradeVolume: 10 }] } } as any;
    }};
    const provider = new SmartAPIPriceProvider({ apiKey: "k", clientCode: "c", password: "p", totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" }, http);
    const quote = await provider.getQuote("TCS");
    expect(quote.price).toBe(3800);
    expect(quoteCalls).toBe(2);
  });

  it("clears tokens and re-authenticates after a WebSocket authentication failure", async () => {
    vi.useFakeTimers();
    let failAuth = true;
    const logins: string[] = [];
    const http = { request: async (url: string) => {
      if (url.includes("loginByPassword")) { logins.push(url); if (failAuth) throw new Error("SmartAPI HTTP 401"); return { status: true, message: "SUCCESS", data: { jwtToken: "jwt", feedToken: "feed" } } as any; }
      return { status: true, message: "SUCCESS", data: {} } as any;
    }};
    const sockets: FakeSocket[] = [];
    const provider = new SmartAPIPriceProvider({ apiKey: "k", clientCode: "c", password: "p", totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" }, http, () => { const socket = new FakeSocket(); sockets.push(socket); return socket; });
    const close = provider.subscribeTicks(["TCS"], () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(logins).toHaveLength(1);
    expect(sockets).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(logins).toHaveLength(2);
    failAuth = false;
    await vi.advanceTimersByTimeAsync(2000);
    expect(logins).toHaveLength(3);
    expect(sockets).toHaveLength(1);
    close();
  });

  it("emits non-secret telemetry for auth, subscription and the first tick", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const http = { request: async (url: string) => url.includes("loginByPassword")
      ? { status: true, message: "SUCCESS", data: { jwtToken: "JWT-TOKEN-VALUE", feedToken: "FEED-TOKEN-VALUE" } } as any
      : { status: true, message: "SUCCESS", data: {} } as any };
    const sockets: FakeSocket[] = [];
    const provider = new SmartAPIPriceProvider({ apiKey: "k", clientCode: "c", password: "MPIN-VALUE", totpSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" }, http, () => { const socket = new FakeSocket(); sockets.push(socket); return socket; });
    const close = provider.subscribeTicks(["TCS"], () => {});
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.open();
    sockets[0]!.message(quoteBinary("11536", 380_050, 1200));
    sockets[0]!.message(quoteBinary("11536", 380_100, 1300));
    sockets[0]!.drop();
    const lines = log.mock.calls.map((args) => String(args[0]));
    expect(lines.some((line) => line.includes("SmartAPI authenticated"))).toBe(true);
    expect(lines.some((line) => line.includes("SmartAPI stream connected") && line.includes('"tokens":1'))).toBe(true);
    expect(lines.filter((line) => line.includes("SmartAPI first tick")).length).toBe(1);
    expect(lines.some((line) => line.includes("SmartAPI stream closed"))).toBe(true);
    const combined = lines.join("\n");
    expect(combined).not.toContain("JWT-TOKEN-VALUE");
    expect(combined).not.toContain("FEED-TOKEN-VALUE");
    expect(combined).not.toContain("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(combined).not.toContain("MPIN-VALUE");
    close();
  });
});
