import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";

import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { Footer } from "@/components/Footer";
import { MotionEffects } from "@/components/MotionEffects";
import { PrivacyAwareAnalytics } from "@/components/PrivacyAwareAnalytics";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SiteHeader } from "@/components/SiteHeader";
import { artist } from "@/lib/artist";
import { getSiteContent } from "@/lib/site-content";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://wallerstedt.live"),
  title: {
    default: artist.shortName,
    template: `%s | ${artist.shortName}`,
  },
  description: "hi! I make piano music :)",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: artist.shortName,
    statusBarStyle: "black-translucent",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
  openGraph: {
    title: artist.shortName,
    description: "hi! I make piano music :)",
    url: "https://wallerstedt.live",
    siteName: artist.shortName,
    images: [{ url: "/media/after-dark.jpg", width: 512, height: 512 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: artist.shortName,
    description: "hi! I make piano music :)",
    images: ["/media/after-dark.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0e0e0e",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const siteContent = await getSiteContent();

  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable}`}>
        <ServiceWorkerRegister />
        <AnalyticsTracker />
        <MotionEffects />
        <SiteHeader />
        {children}
        <Footer contactEmail={siteContent.contactEmail} />
        <PrivacyAwareAnalytics />
      </body>
    </html>
  );
}
