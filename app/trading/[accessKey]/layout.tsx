import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { tradingAccessKeyMatches } from "@/lib/trading-access";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ accessKey: string }>;
}): Promise<Metadata> {
  const { accessKey } = await params;
  if (!tradingAccessKeyMatches(accessKey)) {
    return {
      title: "Not found",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: "Trading",
    referrer: "no-referrer",
    robots: { index: false, follow: false, noarchive: true, noimageindex: true },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#161616",
};

export default function PrivateTradingLayout({ children }: { children: ReactNode }) {
  return children;
}
