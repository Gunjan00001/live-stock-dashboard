import type { Instrument } from "@market-watch/shared-types";

export const instruments: Instrument[] = [
  { symbol: "RELIANCE", exchange: "NSE", type: "EQUITY", name: "Reliance Industries", sector: "Energy", marketCap: 2000000 },
  { symbol: "TCS", exchange: "NSE", type: "EQUITY", name: "Tata Consultancy Services", sector: "Technology", marketCap: 1450000 },
  { symbol: "HDFCBANK", exchange: "NSE", type: "EQUITY", name: "HDFC Bank", sector: "Financial Services", marketCap: 1250000 },
  { symbol: "INFY", exchange: "NSE", type: "EQUITY", name: "Infosys", sector: "Technology", marketCap: 780000 },
  { symbol: "ICICIBANK", exchange: "NSE", type: "EQUITY", name: "ICICI Bank", sector: "Financial Services", marketCap: 920000 },
  { symbol: "HINDUNILVR", exchange: "NSE", type: "EQUITY", name: "Hindustan Unilever", sector: "Consumer", marketCap: 610000 },
  { symbol: "SBIN", exchange: "NSE", type: "EQUITY", name: "State Bank of India", sector: "Financial Services", marketCap: 710000 },
  { symbol: "NIFTY50", exchange: "NSE", type: "INDEX", name: "NIFTY 50" },
  { symbol: "SENSEX", exchange: "BSE", type: "INDEX", name: "SENSEX" }
];

export function findInstrument(symbol: string) {
  return instruments.find((item) => item.symbol === symbol.toUpperCase());
}

export function searchInstruments(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return instruments;
  return instruments.filter((item) => item.symbol.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle));
}
