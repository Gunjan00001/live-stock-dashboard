import type { Exchange } from "@market-watch/shared-types";

export function instrumentKey(exchange: Exchange | string, symbol: string): string {
  return `${exchange}:${symbol.toUpperCase()}`;
}

export function parseExchange(value: string | null | undefined): Exchange | undefined {
  const upper = String(value ?? "").toUpperCase();
  return upper === "NSE" || upper === "BSE" ? upper : undefined;
}
