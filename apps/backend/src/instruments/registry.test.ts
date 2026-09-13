import { describe, expect, it } from "vitest";
import { allInstruments, findByToken, instrumentKey, normalize, resolve, search } from "./registry.js";

function symbols(query: string) { return search(query).map((item) => item.symbol); }
function find(query: string, exchange: "NSE" | "BSE") { return search(query).find((item) => item.exchange === exchange); }

describe("instrument registry search", () => {
  it("normalizes spaces and punctuation", () => {
    expect(normalize("Yes Bank")).toBe("yesbank");
    expect(normalize("M&M")).toBe("mm");
    expect(normalize("Reliance Industries")).toBe("relianceindustries");
  });

  it("finds YESBANK by symbol and company name, on both exchanges", () => {
    for (const query of ["YESBANK", "yes bank", "Yes Bank", "yesbank"]) {
      const nse = find(query, "NSE");
      const bse = find(query, "BSE");
      expect(nse).toMatchObject({ symbol: "YESBANK", token: "11915", exchange: "NSE" });
      expect(bse).toMatchObject({ symbol: "YESBANK", token: "532648", exchange: "BSE" });
    }
  });

  it("finds RELIANCE and TCS by symbol and full company name", () => {
    expect(find("RELIANCE", "NSE")).toMatchObject({ token: "2885", name: "Reliance Industries Limited" });
    expect(find("reliance industries", "NSE")).toMatchObject({ symbol: "RELIANCE" });
    expect(find("TCS", "NSE")).toMatchObject({ token: "11536" });
    expect(find("Tata Consultancy Services", "NSE")).toMatchObject({ symbol: "TCS" });
  });

  it("finds TATASTEEL by company name and is case-insensitive and partial", () => {
    expect(find("tata steel", "NSE")).toMatchObject({ symbol: "TATASTEEL", token: "3499" });
    expect(find("TATA STEEL", "NSE")).toMatchObject({ symbol: "TATASTEEL" });
    expect(symbols("reli")).toContain("RELIANCE");
  });

  it("returns an exact token per exchange and never merges them", () => {
    const results = search("YESBANK").filter((item) => item.symbol === "YESBANK");
    expect(results.map((item) => `${item.exchange}:${item.token}`).sort()).toEqual(["BSE:532648", "NSE:11915"]);
  });

  it("resolves by exchange or NSE-first and looks up by token", () => {
    expect(resolve("YESBANK", "BSE")?.token).toBe("532648");
    expect(resolve("YESBANK")?.exchange).toBe("NSE");
    expect(findByToken(3, "532648")?.symbol).toBe("YESBANK");
    expect(instrumentKey("NSE", "yesbank")).toBe("NSE:YESBANK");
  });

  it("contains only NSE/BSE cash equities (no derivatives, ETFs, debt)", () => {
    for (const instrument of allInstruments()) {
      expect(instrument.exchange === "NSE" || instrument.exchange === "BSE").toBe(true);
      expect([1, 3]).toContain(instrument.exchangeType);
      expect(instrument.type).toBe("EQUITY");
    }
    expect(search("RELIANCE29SEP261210PE")).toEqual([]);
    expect(search("BANKNIFTY29SEP2652000CE")).toEqual([]);
  });

  it("requires a minimum query length", () => {
    expect(search("y")).toEqual([]);
  });
});
