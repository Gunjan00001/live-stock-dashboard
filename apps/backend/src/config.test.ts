import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("backend configuration", () => {
  it("requires valid URLs when adapters are enabled", () => {
    expect(() => loadConfig({ NODE_ENV: "development", REDIS_ENABLED: "true", REDIS_URL: "not-a-url" })).toThrow("REDIS_URL must be a valid URL");
  });

  it("rejects the market-open override in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production", FORCE_MARKET_OPEN: "true" })).toThrow("FORCE_MARKET_OPEN is not allowed in production");
  });
});
