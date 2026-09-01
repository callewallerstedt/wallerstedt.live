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
      robots: { index: false, follow: false },
    };
  }

  const encodedKey = encodeURIComponent(accessKey);
  return {
    title: "Trading",
    referrer: "no-referrer",
    manifest: `/trading/${encodedKey}/manifest.webmanifest`,
    robots: { index: false, follow: false, noarchive: true, noimageindex: true },
    appleWebApp: {
      capable: true,
      title: "Trading",
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon: [
        { url: "/trading-icon.svg", type: "image/svg+xml" },
        { url: "/trading-icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/trading-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/trading-icon-180.png", sizes: "180x180", type: "image/png" }],
    },
    other: {
      "mobile-web-app-capable": "yes",
      "apple-mobile-web-app-capable": "yes",
      "apple-mobile-web-app-title": "Trading",
      "apple-mobile-web-app-status-bar-style": "black-translucent",
    },
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
