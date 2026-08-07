import { describe, expect, it } from "vitest";
import { findInstrument, searchInstruments } from "./catalog.js";

describe("instrument catalog", () => {
  it("normalizes symbol lookup", () => {
    expect(findInstrument("sensex")?.exchange).toBe("BSE");
  });

  it("searches both symbols and company names", () => {
    expect(searchInstruments("consultancy").map((item) => item.symbol)).toContain("TCS");
  });
});
