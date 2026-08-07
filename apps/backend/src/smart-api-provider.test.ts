import { describe, expect, it } from "vitest";
import { mapCandleRows, mapQuoteResponse, mapSmartTick, SmartAPIPriceProvider, type SmartApiQuoteResponse } from "./smart-api-provider.js";

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
