import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@/components/accounting/accounting.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ accessKey: string }>;
}): Promise<Metadata> {
  const { accessKey } = await params;
  const encodedKey = encodeURIComponent(accessKey);
  return {
    title: "Bokföring | Wallerstedt Productions AB",
    description: "Privat, mobil bokföring för Wallerstedt Productions AB.",
    referrer: "no-referrer",
    manifest: `/vault/${encodedKey}/manifest.webmanifest`,
    robots: { index: false, follow: false, noarchive: true, noimageindex: true },
    appleWebApp: {
      capable: true,
      title: "Bokföring",
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon: [
        { url: "/accounting-icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/accounting-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/accounting-icon-180.png", sizes: "180x180", type: "image/png" }],
    },
    other: {
      "mobile-web-app-capable": "yes",
      "apple-mobile-web-app-capable": "yes",
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
  themeColor: "#070707",
};

export default function AccountingVaultLayout({ children }: { children: ReactNode }) {
  return children;
}
