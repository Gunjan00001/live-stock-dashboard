import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("backend configuration", () => {
  it("requires valid URLs when adapters are enabled", () => {
    expect(() => loadConfig({ NODE_ENV: "development", REDIS_ENABLED: "true", REDIS_URL: "not-a-url" })).toThrow("REDIS_URL must be a valid URL");
  });

  it("rejects the market-open override in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production", FORCE_MARKET_OPEN: "true" })).toThrow("FORCE_MARKET_OPEN is not allowed in production");
  });

  it("selects the angelone provider and requires its settings when enabled", () => {
    const config = loadConfig({ MARKET_DATA_PROVIDER: "angelone", ANGELONE_API_KEY: "k", ANGELONE_CLIENT_CODE: "c", ANGELONE_PASSWORD: "p", ANGELONE_TOTP_SECRET: "s", ANGELONE_MAC_ADDRESS: "m", ANGELONE_CLIENT_LOCAL_IP: "1.1.1.1", ANGELONE_CLIENT_PUBLIC_IP: "2.2.2.2" });
    expect(config.marketDataProvider).toBe("angelone");
    expect(config.angelone).toMatchObject({ apiKey: "k", clientCode: "c", subscriptionMode: 2, websocketUrl: "wss://smartapisocket.angelone.in/smart-stream" });
  });

  it("throws when angelone is selected without credentials", () => {
    expect(() => loadConfig({ MARKET_DATA_PROVIDER: "angelone" })).toThrow(/ANGELONE_/);
  });

  it("does not require static-IP headers for market data", () => {
    const config = loadConfig({ MARKET_DATA_PROVIDER: "angelone", ANGELONE_API_KEY: "k", ANGELONE_CLIENT_CODE: "c", ANGELONE_PASSWORD: "p", ANGELONE_TOTP_SECRET: "s" });
    expect(config.angelone).toMatchObject({ macAddress: "00:00:00:00:00:00", clientLocalIp: "127.0.0.1", clientPublicIp: "127.0.0.1" });
  });

  it("defaults to the mock provider", () => {
    const config = loadConfig({ NODE_ENV: "test" });
    expect(config.marketDataProvider).toBe("mock");
    expect(config.angelone).toBeUndefined();
  });
});
