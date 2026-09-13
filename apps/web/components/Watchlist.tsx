import Link from "next/link";
import type { Quote } from "@market-watch/shared-types";
import { formatVolume } from "../lib/format";

export function Watchlist({ quotes, id, onRemove, isRemovable }: { quotes: Quote[]; id?: string; onRemove?: (quote: Quote) => void; isRemovable?: (quote: Quote) => boolean }) {
  return <div className="panel watchlist" id={id} data-reveal><div className="panel-heading"><div><div className="eyebrow">Live watchlist</div><h2>Market watch</h2></div><span className="muted">Live ticks</span></div><table><thead><tr><th>Instrument</th><th>LTP</th><th>Change</th><th>Change %</th><th>Volume</th>{onRemove ? <th></th> : null}</tr></thead><tbody>{quotes.map((quote) => {
    const up = quote.change >= 0;
    const removable = Boolean(onRemove && isRemovable?.(quote));
    return <tr key={`${quote.exchange}:${quote.symbol}`}><td><Link href={`/stock/${quote.symbol}?exchange=${quote.exchange}`}><span className="symbol">{quote.symbol}<small>{quote.exchange}</small></span></Link></td><td>{quote.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td><td className={`change ${up ? "up" : "down"}`}>{up ? "+" : ""}{quote.change.toFixed(2)}</td><td className={`change ${up ? "up" : "down"}`}>{up ? "+" : ""}{quote.changePercent.toFixed(2)}%</td><td>{formatVolume(quote.volume)}</td>{onRemove ? <td>{removable ? <button type="button" className="watch-remove" aria-label={`Remove ${quote.symbol}`} onClick={() => onRemove(quote)}>×</button> : null}</td> : null}</tr>;
  })}</tbody></table></div>;
}
