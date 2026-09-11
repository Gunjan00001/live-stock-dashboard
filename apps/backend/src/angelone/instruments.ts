import { instruments } from "../catalog.js";
import { angelInstruments as generated } from "./instruments.generated.js";

export interface AngelInstrument {
  token: string;
  exchangeType: number;
  exchange: "NSE" | "BSE";
}

export const angelInstruments: Record<string, AngelInstrument> = generated;

export function resolveAngelInstruments(overrides: Record<string, Partial<AngelInstrument>> = {}) {
  const resolved: Record<string, AngelInstrument> = {};
  for (const instrument of instruments) {
    const base = generated[instrument.symbol];
    if (!base) throw new Error(`Missing Angel One token for ${instrument.symbol}`);
    resolved[instrument.symbol] = { ...base, ...overrides[instrument.symbol] };
  }
  return resolved;
}

export function tokenToSymbol(map: Record<string, AngelInstrument>) {
  const result: Record<string, string> = {};
  for (const [symbol, value] of Object.entries(map)) result[value.token] = symbol;
  return result;
}
