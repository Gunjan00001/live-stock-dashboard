"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Exchange, InstrumentSearchResult, Quote } from "@market-watch/shared-types";
import { api, openMarketSocket } from "../lib/api";
import { instrumentKey } from "../lib/instrument-key";
import { MarketCard } from "../components/MarketCard";
import { Watchlist } from "../components/Watchlist";
import { StateMessage } from "../components/StateMessage";
import { TickerStrip } from "../components/TickerStrip";
import { SectionNav } from "../components/SectionNav";
import { TopBar } from "../components/TopBar";
import { ArticleCard } from "../components/ArticleCard";
import { IconArrowRight, IconSearch } from "../components/icons";
import { articles } from "../content/articles";

type WatchItem = { exchange: Exchange; symbol: string; name: string; isDefault: boolean };

const DEFAULT_WATCHLIST: WatchItem[] = [
  { exchange: "NSE", symbol: "NIFTY50", name: "NIFTY 50", isDefault: true },
  { exchange: "BSE", symbol: "SENSEX", name: "BSE SENSEX", isDefault: true },
  { exchange: "NSE", symbol: "RELIANCE", name: "Reliance Industries", isDefault: true },
  { exchange: "NSE", symbol: "TCS", name: "Tata Consultancy Services", isDefault: true },
  { exchange: "NSE", symbol: "HDFCBANK", name: "HDFC Bank", isDefault: true },
  { exchange: "NSE", symbol: "INFY", name: "Infosys", isDefault: true },
  { exchange: "NSE", symbol: "ICICIBANK", name: "ICICI Bank", isDefault: true },
  { exchange: "NSE", symbol: "SBIN", name: "State Bank of India", isDefault: true },
  { exchange: "NSE", symbol: "HINDUNILVR", name: "Hindustan Unilever", isDefault: true }
];

const WATCHLIST_STORAGE_KEY = "market-watch:watchlist";

function loadExtraWatchlist(): WatchItem[] {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && (item.exchange === "NSE" || item.exchange === "BSE") && item.symbol).map((item) => ({ exchange: item.exchange, symbol: item.symbol.toUpperCase(), name: String(item.name ?? item.symbol), isDefault: false }));
  } catch { return []; }
}

function saveExtraWatchlist(items: WatchItem[]) {
  try { window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(items.filter((item) => !item.isDefault))); } catch { return; }
}

function formatNextOpen(iso: string) {
  try { return new Date(iso).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }); } catch { return "soon"; }
}

export default function Home() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [watchlist, setWatchlist] = useState<WatchItem[]>(DEFAULT_WATCHLIST);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstrumentSearchResult[]>([]);
  const [searchError, setSearchError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [marketClosed, setMarketClosed] = useState(false);
  const [nextOpen, setNextOpen] = useState<string>();
  const liveRef = useRef<ReturnType<typeof openMarketSocket> | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const initial = [...DEFAULT_WATCHLIST, ...loadExtraWatchlist()];
    setWatchlist(initial);
    const live = openMarketSocket(
      (tick) => setQuotes((current) => current.map((quote) => instrumentKey(quote.exchange, quote.symbol) === instrumentKey(tick.exchange, tick.symbol) ? { ...quote, timestamp: tick.timestamp, price: tick.price, volume: tick.volume, change: tick.price - quote.previousClose, changePercent: (tick.price - quote.previousClose) / quote.previousClose * 100, dayHigh: Math.max(quote.dayHigh, tick.price), dayLow: Math.min(quote.dayLow, tick.price) } : quote)),
      () => setOffline(true),
      () => setOffline(false)
    );
    liveRef.current = live;
    live.subscribe(initial.map((item) => ({ exchange: item.exchange, symbol: item.symbol })));
    Promise.all([Promise.all(initial.map((item) => api.quote(item.symbol, item.exchange))), api.status()]).then(([values, status]) => {
      if (active) { setQuotes(values); setMarketClosed(!status.open); setNextOpen(status.nextOpen); }
    }).catch(() => setOffline(true));
    return () => { active = false; live.close(); liveRef.current = undefined; };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) { setResults([]); setSearchError(false); return; }
    let active = true;
    setSearchError(false);
    const timer = window.setTimeout(() => {
      api.instruments.search(trimmed).then((response) => { if (active) setResults(response.results); }).catch(() => { if (active) setSearchError(true); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) { elements.forEach((el) => el.classList.add("is-visible")); return; }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.12 });
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const addInstrument = (result: InstrumentSearchResult) => {
    const item: WatchItem = { exchange: result.exchange, symbol: result.symbol, name: result.name, isDefault: false };
    setWatchlist((current) => {
      if (current.some((entry) => instrumentKey(entry.exchange, entry.symbol) === instrumentKey(item.exchange, item.symbol))) return current;
      const next = [...current, item];
      saveExtraWatchlist(next);
      return next;
    });
    liveRef.current?.subscribe([{ exchange: item.exchange, symbol: item.symbol }]);
    api.quote(item.symbol, item.exchange).then((quote) => setQuotes((current) => current.some((entry) => instrumentKey(entry.exchange, entry.symbol) === instrumentKey(quote.exchange, quote.symbol)) ? current : [...current, quote])).catch(() => {});
  };

  const removeInstrument = (quote: Quote) => {
    const key = instrumentKey(quote.exchange, quote.symbol);
    setWatchlist((current) => { const next = current.filter((entry) => instrumentKey(entry.exchange, entry.symbol) !== key); saveExtraWatchlist(next); return next; });
    setQuotes((current) => current.filter((entry) => instrumentKey(entry.exchange, entry.symbol) !== key));
    liveRef.current?.unsubscribe([{ exchange: quote.exchange, symbol: quote.symbol }]);
  };

  const isRemovable = (quote: Quote) => !DEFAULT_WATCHLIST.some((entry) => instrumentKey(entry.exchange, entry.symbol) === instrumentKey(quote.exchange, quote.symbol));

  const statusClass = offline ? "offline" : marketClosed ? "closed" : "live";
  const statusText = offline ? "Backend offline" : marketClosed ? "Markets closed" : "Live";

  return <div className="shell"><TopBar statusText={offline ? "Backend offline" : marketClosed ? "Market closed · showing last prices" : "Market data connected"} offline={offline} /><SectionNav /><main className="page"><section id="top"><div className="hero-meta"><span className="eyebrow">Saturday, 08 August 2026</span><span className={`pill ${statusClass}`}><span className="dot" />{statusText}</span></div><h1>Feel the pulse of India&rsquo;s markets.</h1><p className="muted">Live NSE and BSE prices from open to close, tuned to the instruments you care about.</p><div className="hero-cta"><a className="btn btn-primary" href="#watchlist">Explore the market ↓</a><a className="btn btn-ghost" href="#movers">View movers</a></div></section><div data-reveal><TickerStrip quotes={quotes} /></div>{offline ? <StateMessage tone="error" title="Backend offline" detail="Reconnect the backend to resume live market data." /> : marketClosed ? <StateMessage tone="closed" title="Market closed" detail={`Prices below show the latest available snapshot.${nextOpen ? ` Markets reopen ${formatNextOpen(nextOpen)}.` : ""}`} /> : null}<div className="summary-grid" id="indices" data-reveal>{quotes.slice(0, 2).map((quote) => <MarketCard key={instrumentKey(quote.exchange, quote.symbol)} quote={quote} />)}</div><div className="content-grid"><section className="panel" id="movers" data-reveal><div className="panel-heading"><div><div className="eyebrow">Market movers</div><h2>Top gainers</h2></div></div><div className="mini-table"><div className="mini-table-head"><span>Instrument</span><span>Price</span><span>Change</span></div>{quotes.filter((quote) => quote.change >= 0).slice(0, 4).map((quote) => <div className="mini-row" key={instrumentKey(quote.exchange, quote.symbol)}><span className="mini-symbol">{quote.symbol}</span><span className="mini-price">{quote.price.toFixed(2)}</span><span className={`mini-change ${quote.change >= 0 ? "up" : "down"}`}>{quote.change >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%</span></div>)}</div><div className="mini-table-foot"><a className="mini-more" href="#watchlist">View all movers <IconArrowRight /></a></div></section><section className="panel" data-reveal><div className="panel-heading"><div><div className="eyebrow">Find a stock</div><h2>Search universe</h2></div></div><div className="search-wrap"><IconSearch /><input className="search" placeholder="Search symbol or company" value={query} onChange={(event) => setQuery(event.target.value)} /></div>{query.trim() ? searchError ? <StateMessage title="Search unavailable" detail="Live lookup failed - search the symbol directly." /> : results.length === 0 ? <StateMessage title="No matching symbols" detail={`No instruments found for "${query.trim()}".`} /> : <div className="list">{results.map((result) => <div className="search-result" key={instrumentKey(result.exchange, result.symbol)}><Link href={`/stock/${result.symbol}?exchange=${result.exchange}`}><span><strong>{result.name}</strong><small>{result.tradingSymbol} · {result.exchange}</small></span></Link><button type="button" className="search-add" aria-label={`Add ${result.symbol} ${result.exchange}`} onClick={() => addInstrument(result)}>Add</button></div>)}</div> : <div className="list">{quotes.slice(0, 4).map((quote) => <div className="row" key={instrumentKey(quote.exchange, quote.symbol)}><strong>{quote.symbol}</strong><span className={`row-value change ${quote.change >= 0 ? "up" : "down"}`}>{quote.price.toFixed(2)}</span></div>)}</div>}</section><Watchlist quotes={quotes} id="watchlist" onRemove={removeInstrument} isRemovable={isRemovable} /></div><section className="articles" id="learn" data-reveal><div className="panel-heading"><div><div className="eyebrow">Learning</div><h2>Know what you own</h2></div></div><p className="muted">Guides, market analysis, and the principles of legendary investors - the fundamentals behind the ticker.</p><div className="article-grid">{articles.map((article) => <ArticleCard key={article.slug} article={article} />)}</div></section></main></div>;
}
