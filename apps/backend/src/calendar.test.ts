import { describe, expect, it } from "vitest";
import { getMarketStatus } from "./calendar.js";

describe("market calendar", () => {
  it("opens during a weekday Indian session", () => {
    expect(getMarketStatus(new Date("2026-08-06T06:00:00.000Z")).open).toBe(true);
  });

  it("closes on weekends", () => {
    expect(getMarketStatus(new Date("2026-08-08T06:00:00.000Z")).open).toBe(false);
  });

  it("closes on a configured Indian holiday", () => {
    expect(getMarketStatus(new Date("2026-08-15T06:00:00.000Z")).open).toBe(false);
  });
});
