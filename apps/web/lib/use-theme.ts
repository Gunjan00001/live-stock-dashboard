"use client";
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setTheme(el.getAttribute("data-theme") === "dark" ? "dark" : "light");
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
