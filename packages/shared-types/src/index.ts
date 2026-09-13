export type Exchange = "NSE" | "BSE";
export type InstrumentType = "EQUITY" | "INDEX";
export type HistoricalRange = "1D" | "1W" | "1M" | "1Y";

export interface Instrument {
  symbol: string;
  exchange: Exchange;
  type: InstrumentType;
  name: string;
  sector?: string;
  marketCap?: number;
}

export interface Quote {
  symbol: string;
  exchange: Exchange;
  timestamp: string;
  price: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  week52High: number;
  week52Low: number;
}

export interface Tick {
  symbol: string;
  exchange: Exchange;
  timestamp: string;
  price: number;
  volume: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketStatus {
  open: boolean;
  session: "PRE_OPEN" | "OPEN" | "CLOSED";
  timestamp: string;
  nextOpen?: string;
}

export interface SearchResult extends Instrument { }

export interface InstrumentSearchResult {
  exchange: Exchange;
  exchangeType: number;
  token: string;
  symbol: string;
  tradingSymbol: string;
  name: string;
  isin?: string;
  type: "EQUITY";
}

export interface WsInstrument {
  exchange: Exchange;
  symbol: string;
}

export interface WsSubscriptionPayload {
  symbols?: string[];
  instruments?: WsInstrument[];
}

export interface WsMessage<TType extends string, TPayload> {
  version: 1;
  type: TType;
  payload: TPayload;
}

export type ClientWsMessage =
  | WsMessage<"subscribe", WsSubscriptionPayload>
  | WsMessage<"unsubscribe", WsSubscriptionPayload>;

export type ServerWsMessage =
  | WsMessage<"tick", { tick: Tick }>
  | WsMessage<"subscribed", WsSubscriptionPayload>
  | WsMessage<"unsubscribed", WsSubscriptionPayload>
  | WsMessage<"status", MarketStatus>
  | WsMessage<"error", { message: string }>;
