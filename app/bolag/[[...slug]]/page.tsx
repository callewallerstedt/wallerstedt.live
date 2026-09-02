import { notFound } from "next/navigation";

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
import { configuredOsAccessKey, resolveOsRoute } from "@/lib/os/route";
import { loadOsPage } from "@/lib/os/snapshot";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const resolved = resolveOsRoute(slug, configuredOsAccessKey());
  if (!resolved) notFound();
  const snapshot = await loadOsPage(resolved.accessKey);
  if (!snapshot) return null;
  const { accessKey, page } = resolved;

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
      return <CustomersPage snapshot={snapshot} />;
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
