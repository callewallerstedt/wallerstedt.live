import type { Metadata } from "next";

import "./trading.css";

export const metadata: Metadata = {
  title: "Trading",
  description: "Rayner's public long-only swing experiment. Live book, no broker identifiers.",
  openGraph: {
    title: "Trading | Wallerstedt",
    description: "Rayner's public long-only swing experiment. Live book, no broker identifiers.",
    url: "https://wallerstedt.live/trading",
    type: "website",
  },
};

export default function TradingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
