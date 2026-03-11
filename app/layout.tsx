import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";

import { Footer } from "@/components/Footer";
import { MotionEffects } from "@/components/MotionEffects";
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
    icon: "/favicon.svg",
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const siteContent = await getSiteContent();

  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable}`}>
        <MotionEffects />
        <SiteHeader />
        {children}
        <Footer contactEmail={siteContent.contactEmail} />
      </body>
    </html>
  );
}
