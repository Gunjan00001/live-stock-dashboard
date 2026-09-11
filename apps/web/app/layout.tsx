import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Market Watch — Live NSE & BSE", template: "%s · Market Watch" },
  description: "Read-only NSE and BSE market tracker with live prices, candles, and investing guides. Prices stream live while markets are open.",
  openGraph: {
    title: "Market Watch — Live NSE & BSE",
    description: "Live NSE and BSE prices, watchlists, and investing guides.",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#533afd" };

const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(!t)t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en"><body><script dangerouslySetInnerHTML={{ __html: themeScript }} />{children}<footer className="footer"><div className="footer-inner"><div className="brand"><span className="brand-mark">M</span>Market Watch</div><div className="footer-meta"><span className="footer-note">Read-only NSE and BSE market tracker. Prices stream live while markets are open.</span><span className="footer-legal">© 2026 Market Watch · Educational content only — not investment advice.</span></div></div></footer></body></html>; }
