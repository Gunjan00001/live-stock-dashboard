"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Candle, Exchange, MarketStatus, Quote, Tick } from "@market-watch/shared-types";
import { api, openMarketSocket } from "../../../lib/api";
import { parseExchange } from "../../../lib/instrument-key";
import { StockChart } from "../../../components/StockChart";
import { StateMessage } from "../../../components/StateMessage";
import { TopBar } from "../../../components/TopBar";
import { IconArrowBack, IconArrowUp, IconArrowDown } from "../../../components/icons";
import { formatVolume } from "../../../lib/format";

export default function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: rawSymbol } = use(params);
  const searchParams = useSearchParams();
  const exchange = parseExchange(searchParams.get("exchange"));
  return <StockDetail symbol={rawSymbol.toUpperCase()} exchange={exchange} />;
}

function StockDetail({ symbol, exchange }: { symbol: string; exchange?: Exchange }) {
  const [quote, setQuote] = useState<Quote>();
  const [candles, setCandles] = useState<Candle[]>([]);
  const [range, setRange] = useState("1D");
  const [tick, setTick] = useState<Tick>();
  const [quoteError, setQuoteError] = useState(false);
  const [historicalError, setHistoricalError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>();

  useEffect(() => {
    let active = true;
    setQuoteError(false);
    setHistoricalError(false);
    Promise.all([api.quote(symbol, exchange), api.status()]).then(([nextQuote, status]) => {
      if (active) { setQuote(nextQuote); setMarketStatus(status); }
    }).catch(() => { if (active) setQuoteError(true); });
    api.historical(symbol, range, exchange).then((nextCandles) => { if (active) setCandles(nextCandles); }).catch(() => { if (active) setHistoricalError(true); });
    return () => { active = false; };
  }, [symbol, range, exchange]);

  useEffect(() => {
    const live = openMarketSocket((next) => {
      if (next.symbol === symbol && (!exchange || next.exchange === exchange)) {
        setTick(next);
        setQuote((current) => current ? { ...current, price: next.price, timestamp: next.timestamp, volume: next.volume, change: next.price - current.previousClose, changePercent: (next.price - current.previousClose) / current.previousClose * 100 } : current);
      }
    }, () => setOffline(true), () => setOffline(false));
    live.subscribe([{ exchange: exchange ?? "NSE", symbol }]);
    return () => live.close();
  }, [symbol, exchange]);

  if (quoteError) return <main className="page"><Link className="back" href="/"><IconArrowBack />Back to market</Link><StateMessage tone="error" title="Instrument unavailable" detail={`We could not load ${symbol}. Check the symbol and try again.`} /></main>;
  if (!quote) return <main className="page"><Link className="back" href="/"><IconArrowBack />Back to market</Link><p>Loading stock data...</p></main>;

  const up = quote.change >= 0;
  return <div className="shell"><TopBar statusText={offline ? "Backend offline" : marketStatus?.open ? "Live updates" : "Market closed · last update shown"} offline={offline} /><main className="page"><Link className="back" href="/"><IconArrowBack />Back to market</Link>{offline ? <StateMessage tone="error" title="Backend offline" detail="The displayed quote is the last available snapshot." /> : !marketStatus?.open ? <StateMessage tone="closed" title="Market closed" detail={`Last update: ${new Date(quote.timestamp).toLocaleString("en-IN")}`} /> : null}<div className="detail-header"><div><div className="eyebrow">{quote.exchange} · {symbol}</div><h1>{symbol}</h1><div className="muted">Market data snapshot</div></div><div><div className="detail-price">{quote.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div><div className={`change ${up ? "up" : "down"}`}>{up ? <IconArrowUp /> : <IconArrowDown />}<span className="tabular">{up ? "+" : ""}{quote.change.toFixed(2)} ({up ? "+" : ""}{quote.changePercent.toFixed(2)}%)</span></div></div></div><section className="panel chart-wrap"><div className="panel-heading banded"><div><div className="eyebrow">Price action</div><h2>{range} candles</h2></div><div className="timeframes">{["1D", "1W", "1M", "1Y"].map((item) => <button className={range === item ? "active" : ""} key={item} onClick={() => setRange(item)}>{item}</button>)}</div></div>{historicalError ? <StateMessage tone="error" title="Historical data unavailable" detail="The quote is available, but chart history could not be loaded." /> : <StockChart candles={candles} tick={tick} />}</section><section className="stats">{[["Open", quote.open], ["Day high", quote.dayHigh], ["Day low", quote.dayLow], ["Prev close", quote.previousClose], ["52W high", quote.week52High], ["52W low", quote.week52Low], ["Volume", formatVolume(quote.volume)], ["Last update", new Date(quote.timestamp).toLocaleTimeString("en-IN")]].map(([label, value]) => <div className="stat" key={String(label)}><div className="stat-label">{label}</div><div className="stat-value">{typeof value === "number" ? value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : value}</div></div>)}</section></main></div>;
}
