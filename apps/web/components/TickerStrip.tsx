"use client";
import { useEffect, useState } from "react";
import type { Quote } from "@market-watch/shared-types";

function Chip({ quote }: { quote: Quote }) {
  const up = quote.change >= 0;
  return <div className="ticker-chip"><span className="ticker-symbol">{quote.symbol}</span><span className="ticker-price">{quote.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span><span className={`ticker-change ${up ? "up" : "down"}`}>{up ? "+" : ""}{quote.changePercent.toFixed(2)}%</span></div>;
}

export function TickerStrip({ quotes }: { quotes: Quote[] }) {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  if (!quotes.length) return null;
  const items = reducedMotion ? quotes : [...quotes, ...quotes];
  return <div className="ticker" aria-label="Live prices"><div className="ticker-track">{items.map((quote, index) => <Chip key={index} quote={quote} />)}</div></div>;
}
