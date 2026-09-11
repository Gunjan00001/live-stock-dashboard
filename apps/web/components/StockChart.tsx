"use client";
import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, HistogramSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle, Tick } from "@market-watch/shared-types";
import { useTheme } from "../lib/use-theme";

const palette = {
  light: { background: "#ffffff", text: "#64748d", grid: "#e5edf5", up: "#0b9a61", down: "#d34b56" },
  dark: { background: "#171721", text: "#c3c3cc", grid: "#262633", up: "#3bb67c", down: "#d9666d" },
} as const;

export function StockChart({ candles, tick }: { candles: Candle[]; tick?: Tick }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | undefined>(undefined);
  const theme = useTheme();
  useEffect(() => {
    if (!ref.current) return;
    const colors = palette[theme];
    const instance = createChart(ref.current, { layout: { background: { color: colors.background }, textColor: colors.text }, grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } }, height: 390 });
    const candleSeries = instance.addSeries(CandlestickSeries, { upColor: colors.up, downColor: colors.down, borderVisible: false, wickUpColor: colors.up, wickDownColor: colors.down });
    const volumeSeries = instance.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
    const chartCandles = candles.map((candle) => ({ ...candle, time: candle.time as UTCTimestamp }));
    candleSeries.setData(chartCandles);
    volumeSeries.setData(candles.map((candle) => ({ time: candle.time as UTCTimestamp, value: candle.volume, color: candle.close >= candle.open ? `${colors.up}55` : `${colors.down}55` })));
    if (tick && candles.length) { const last = candles[candles.length - 1]; candleSeries.update({ time: last.time as UTCTimestamp, open: last.open, high: Math.max(last.high, tick.price), low: Math.min(last.low, tick.price), close: tick.price }); }
    instance.timeScale().fitContent();
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.applyOptions({ width: ref.current?.clientWidth ?? 0 }));
    observer.observe(ref.current);
    return () => { observer.disconnect(); instance.remove(); chart.current = undefined; };
  }, [candles, tick, theme]);
  return <div ref={ref} className="chart" />;
}
