"use client";
import { useEffect, useState } from "react";

const sections = [
  { id: "indices", label: "Indices" },
  { id: "movers", label: "Movers" },
  { id: "watchlist", label: "Watchlist" },
  { id: "learn", label: "Learn" },
];

export function SectionNav() {
  const [active, setActive] = useState("indices");
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) setActive(entry.target.id); });
    }, { rootMargin: "-35% 0px -55% 0px" });
    sections.forEach((section) => { const el = document.getElementById(section.id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);
  return <nav className="section-nav" aria-label="Sections">{sections.map((section) => <a key={section.id} href={`#${section.id}`} className={active === section.id ? "active" : ""}>{section.label}</a>)}</nav>;
}
