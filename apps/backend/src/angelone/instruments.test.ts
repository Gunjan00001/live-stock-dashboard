import { describe, expect, it } from "vitest";
import { instruments } from "../catalog.js";
import { angelInstruments, resolveAngelInstruments, tokenToSymbol } from "./instruments.js";

describe("angel instruments", () => {
  it("maps every catalog symbol", () => {
    for (const instrument of instruments) expect(angelInstruments[instrument.symbol]).toBeDefined();
  });

  it("applies overrides", () => {
    const resolved = resolveAngelInstruments({ TCS: { token: "999" } });
    expect(resolved.TCS!.token).toBe("999");
    expect(resolved.RELIANCE!.token).toBe(angelInstruments.RELIANCE!.token);
  });

  it("builds a reverse token map", () => {
    expect(tokenToSymbol(angelInstruments)[angelInstruments.RELIANCE!.token]).toBe("RELIANCE");
  });
});
