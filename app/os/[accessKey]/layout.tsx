import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { OsLogin } from "@/components/os/login";
import { OsProviders } from "@/components/os/providers";
import { OsShell } from "@/components/os/shell";
import { hasOsSession, requireOsAccessKey } from "@/lib/os/session";
import { getOsSnapshot } from "@/lib/os/snapshot";

import "../os.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ accessKey: string }>;
}): Promise<Metadata> {
  const { accessKey } = await params;
  return {
    title: "OS | Wallerstedt Productions AB",
    description: "Owner dashboard for Wallerstedt Productions AB.",
    referrer: "no-referrer",
    robots: { index: false, follow: false, noarchive: true, noimageindex: true },
    other: {
      "os-access": accessKey ? "private" : "private",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#171717",
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
  let alertCount = 0;
  if (signedIn) {
    try {
      alertCount = (await getOsSnapshot(accessKey)).alerts.length;
    } catch {
      alertCount = 0;
    }
  }

  return (
    <div className="os-root dark" data-accent="ember">
      <OsProviders>
        {signedIn ? (
          <OsShell accessKey={accessKey} alertCount={alertCount}>
            {children}
          </OsShell>
        ) : (
          <OsLogin accessKey={accessKey} />
        )}
      </OsProviders>
    </div>
  );
}
