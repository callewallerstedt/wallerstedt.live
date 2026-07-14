import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./tesla.css";

export const metadata: Metadata = {
  title: "Drive",
  description: "Private live Tesla drive dashboard for iPhone.",
  manifest: "/tesla/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Drive", statusBarStyle: "black-translucent" },
  icons: {
    apple: "/tesla-icon-180.png",
    icon: [{ url: "/tesla-drive-icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#050607",
};

export default function TeslaLayout({ children }: { children: React.ReactNode }) {
  return <><Script id="tesla-sw" strategy="afterInteractive">{`if('serviceWorker' in navigator){navigator.serviceWorker.register('/tesla-sw.js',{scope:'/tesla'}).catch(()=>{})}`}</Script>{children}</>;
}
