import { notFound } from "next/navigation";
import { Suspense } from "react";

import { OsVault } from "@/components/os/vault";
import {
  AccountingPage,
  AlertsPage,
  ContentPage,
  CustomersPage,
  InvestmentsPage,
  MoneyPage,
  MusicPage,
  OverviewPage,
  ProjectsPage,
  UpcomingPage,
  WealthPage,
} from "@/components/os/pages";
import { OsPageSkeleton } from "@/components/os/ui";
import { resolveOsRoute, type OsPageSlug } from "@/lib/os/route";
import { hasOsSession } from "@/lib/os/session";
import { loadOsPage } from "@/lib/os/snapshot";

async function OsPageBody({ accessKey, page }: { accessKey: string; page: OsPageSlug }) {
  if (page === "vault") return <OsVault accessKey={accessKey} />;
  const snapshot = await loadOsPage(accessKey, page);
  if (!snapshot) return null;

  switch (page) {
    case "money":
      return <MoneyPage snapshot={snapshot} accessKey={accessKey} />;
    case "music":
      return <MusicPage snapshot={snapshot} />;
    case "content":
      return <ContentPage snapshot={snapshot} />;
    case "projects":
      return <ProjectsPage snapshot={snapshot} />;
    case "customers":
      return <CustomersPage snapshot={snapshot} accessKey={accessKey} />;
    case "accounting":
      return <AccountingPage snapshot={snapshot} accessKey={accessKey} />;
    case "investments":
      return <InvestmentsPage snapshot={snapshot} />;
    case "wealth":
      return <WealthPage snapshot={snapshot} />;
    case "upcoming":
      return <UpcomingPage snapshot={snapshot} />;
    case "alerts":
      return <AlertsPage snapshot={snapshot} />;
    default:
      return <OverviewPage snapshot={snapshot} accessKey={accessKey} />;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ accessKey: string; page?: string[] }>;
}) {
  const { accessKey, page: pageSlug } = await params;
  const resolved = resolveOsRoute(accessKey, pageSlug);
  if (!resolved) notFound();
  if (!(await hasOsSession(resolved.accessKey))) return null;

  return (
    <Suspense fallback={<OsPageSkeleton />}>
      <OsPageBody accessKey={resolved.accessKey} page={resolved.page} />
    </Suspense>
  );
}
