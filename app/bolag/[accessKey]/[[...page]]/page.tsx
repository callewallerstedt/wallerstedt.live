import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { OsVault } from "@/components/os/vault";
import {
  MoneyPage,
  MusicPage,
  OverviewPage,
  SettingsPage,
  TasksPage,
} from "@/components/os/pages";
import { OsPageSkeleton } from "@/components/os/ui";
import { berlinYmd } from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import { osPath } from "@/lib/os/paths";
import { osLegacyTarget, resolveOsRoute, type OsPageSlug } from "@/lib/os/route";
import { hasOsSession } from "@/lib/os/session";
import { loadOsPage } from "@/lib/os/snapshot";

async function OsPageBody({ accessKey, page }: { accessKey: string; page: OsPageSlug }) {
  if (page === "vault") return <OsVault accessKey={accessKey} />;
  const snapshot = await loadOsPage(accessKey, page);
  if (!snapshot) return null;
  const todayYmd = berlinYmd() ?? new Date().toISOString().slice(0, 10);

  switch (page) {
    case "tasks":
      return <TasksPage accessKey={accessKey} snapshot={snapshot} todayYmd={todayYmd} />;
    case "money":
      return <MoneyPage accessKey={accessKey} snapshot={snapshot} />;
    case "music":
      return <MusicPage snapshot={snapshot} todayYmd={todayYmd} />;
    case "settings":
      return <SettingsPage accessKey={accessKey} snapshot={snapshot} />;
    default:
      return <OverviewPage accessKey={accessKey} snapshot={snapshot} todayYmd={todayYmd} />;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ accessKey: string; page?: string[] }>;
}) {
  const { accessKey, page: pageSlug } = await params;
  const resolved = resolveOsRoute(accessKey, pageSlug);
  if (!resolved) {
    // A tab that was merged into another one keeps working instead of 404ing.
    const legacy = osLegacyTarget(pageSlug);
    if (legacy !== null && accessKey?.trim()) redirect(routeHref(osPath(accessKey.trim(), legacy)));
    notFound();
  }
  if (!(await hasOsSession(resolved.accessKey))) return null;

  return (
    <Suspense fallback={<OsPageSkeleton />}>
      <OsPageBody accessKey={resolved.accessKey} page={resolved.page} />
    </Suspense>
  );
}
