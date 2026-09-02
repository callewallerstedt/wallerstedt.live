import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { OsLogin } from "@/components/os/login";
import { OsProviders } from "@/components/os/providers";
import { OsShell } from "@/components/os/shell";
import { routeHref } from "@/lib/os/href";
import { osPath } from "@/lib/os/paths";
import { configuredOsAccessKey, resolveOsRoute } from "@/lib/os/route";
import { hasOsSession, requireOsAccessKey } from "@/lib/os/session";
import { getOsSnapshot } from "@/lib/os/snapshot";

import "../os.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Bolag | Wallerstedt Productions AB",
    description: "Owner dashboard for Wallerstedt Productions AB.",
    referrer: "no-referrer",
    robots: { index: false, follow: false, noarchive: true, noimageindex: true },
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
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const resolved = resolveOsRoute(slug, configuredOsAccessKey());
  if (!resolved) notFound();
  await requireOsAccessKey(resolved.accessKey);
  if (resolved.keyedAlias) {
    redirect(routeHref(osPath(resolved.page)));
  }

  const signedIn = await hasOsSession(resolved.accessKey);
  let alertCount = 0;
  if (signedIn) {
    try {
      alertCount = (await getOsSnapshot(resolved.accessKey)).alerts.length;
    } catch {
      alertCount = 0;
    }
  }

  return (
    <div className="os-root dark" data-accent="ember">
      <OsProviders>
        {signedIn ? (
          <OsShell accessKey={resolved.accessKey} alertCount={alertCount}>
            {children}
          </OsShell>
        ) : (
          <OsLogin />
        )}
      </OsProviders>
    </div>
  );
}
