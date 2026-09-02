import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { OsLogin } from "@/components/os/login";
import { OsProviders } from "@/components/os/providers";
import { OsShell } from "@/components/os/shell";
import { hasOsSession, requireOsAccessKey } from "@/lib/os/session";

import "../os.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Bolag | Wallerstedt Productions AB",
    description: "Owner dashboard for Wallerstedt Productions AB.",
    referrer: "no-referrer",
    robots: { index: false, follow: false, noarchive: true, noimageindex: true },
    appleWebApp: {
      capable: true,
      title: "Bolag",
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
  viewportFit: "cover",
  themeColor: "#161616",
};

export default async function OsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ accessKey: string }>;
}) {
  const { accessKey } = await params;
  await requireOsAccessKey(accessKey);
  const signedIn = await hasOsSession(accessKey);

  return (
    <div className="os-root dark" data-accent="ember">
      <OsProviders>
        {signedIn ? <OsShell accessKey={accessKey}>{children}</OsShell> : <OsLogin accessKey={accessKey} />}
      </OsProviders>
    </div>
  );
}
