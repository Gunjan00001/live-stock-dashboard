import type { Quote } from "@market-watch/shared-types";
import { IconArrowUp, IconArrowDown } from "./icons";

function indexLabel(quote: Quote) {
  if (quote.symbol === "NIFTY50") return "NIFTY 50";
  if (quote.symbol === "SENSEX") return "BSE SENSEX";
  return `${quote.exchange} · ${quote.symbol}`;
}

export function MarketCard({ quote }: { quote: Quote }) { const up = quote.change >= 0; return <div className="card"><div className="card-label">{indexLabel(quote)}</div><div className="price">{quote.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div><div className={`card-change ${up ? "up" : "down"}`}>{up ? <IconArrowUp /> : <IconArrowDown />}<span className="tabular">{up ? "+" : ""}{quote.change.toFixed(2)} ({up ? "+" : ""}{quote.changePercent.toFixed(2)}%)</span></div></div>; }
