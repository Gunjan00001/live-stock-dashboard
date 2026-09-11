"use client";
import { useEffect, useState } from "react";
import { useTheme } from "../lib/use-theme";

function SunIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>;
}

function MoonIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
}

export function ThemeToggle() {
  const theme = useTheme();
  const toggle = () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };
  const dark = theme === "dark";
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Switch to light mode" : "Switch to dark mode"}>{dark ? <SunIcon /> : <MoonIcon />}</button>;
}

export function TopBar({ statusText, offline = false }: { statusText?: string; offline?: boolean }) {
  return <header className="topbar"><div className="brand"><span className="brand-mark">M</span><span className="brand-name">Market Watch</span></div><div className="topbar-right">{statusText ? <div className="status"><span className={`status-dot ${offline ? "down" : ""}`}><span className="dot" /></span>{statusText}</div> : null}<ThemeToggle /></div></header>;
}
