import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@/components/accounting/agent.css";

export const metadata: Metadata = {
  title: "Agent vault | Wallerstedt Productions AB",
  description: "Private agent workspace for Wallerstedt accounting.",
  referrer: "no-referrer",
  robots: { index: false, follow: false, noarchive: true, noimageindex: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0b0d",
};

export default function AgentVaultLayout({ children }: { children: ReactNode }) {
  return children;
}
