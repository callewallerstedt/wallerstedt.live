import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { OsLogin } from "@/components/os/login";
import { OsProviders } from "@/components/os/providers";
import { OsShell } from "@/components/os/shell";
import { COMPANY } from "@/lib/os/company";
import { formatSek } from "@/lib/os/format";
import { hasOsSession, requireOsAccessKey } from "@/lib/os/session";
import { openTaskCount } from "@/lib/os/tasks";

import "../os.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ accessKey: string }>;
}): Promise<Metadata> {
  const { accessKey } = await params;
  return {
    title: "Bolag | Wallerstedt Productions AB",
    manifest: `/bolag/${encodeURIComponent(accessKey)}/manifest.webmanifest`,
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
  const taskCount = signedIn ? await openTaskCount() : 0;
  const companyFields = [
    { label: "Bolagsnamn", value: COMPANY.name },
    { label: "Organisationsnummer", value: COMPANY.orgNumber },
    { label: "Momsregistreringsnummer", value: COMPANY.vat },
    { label: "Verksamhetsbeskrivning", value: COMPANY.registry.verksamhetsbeskrivning, block: true },
    { label: "Säte", value: COMPANY.registry.seat },
    { label: "Bolagsform", value: COMPANY.registry.legalForm },
    { label: "Aktiekapital", value: formatSek(COMPANY.registry.shareCapitalSek * 100) },
    { label: "Registrerat", value: COMPANY.registry.registeredOn },
    { label: "Styrelseledamot", value: COMPANY.registry.boardMember },
    { label: "Suppleant", value: COMPANY.registry.deputy },
  ];

  return (
    <div className="os-root dark" data-accent="ember">
      <OsProviders>
        {signedIn ? (
          <OsShell accessKey={accessKey} companyFields={companyFields} taskCount={taskCount}>
            {children}
          </OsShell>
        ) : (
          <OsLogin accessKey={accessKey} />
        )}
      </OsProviders>
    </div>
  );
}
