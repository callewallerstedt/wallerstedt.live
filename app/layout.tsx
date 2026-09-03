import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Inter, Playfair_Display } from "next/font/google";

import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { PrivacyAwareAnalytics } from "@/components/PrivacyAwareAnalytics";
import { artist } from "@/lib/artist";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-ui",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://wallerstedt.live"),
  title: {
    default: `${artist.shortName} — piano music`,
    template: `%s · ${artist.shortName}`,
  },
  description: artist.tagline,
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: artist.shortName,
    description: artist.tagline,
    url: "https://wallerstedt.live",
    siteName: artist.shortName,
    images: [{ url: "/media/after-dark.jpg", width: 512, height: 512 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: artist.shortName,
    description: artist.tagline,
    images: ["/media/after-dark.jpg"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${playfair.variable} ${geist.variable} ${geistMono.variable} ${instrument.variable}`}
      >
        <AnalyticsTracker />
        {children}
        <PrivacyAwareAnalytics />
      </body>
    </html>
  );
}
