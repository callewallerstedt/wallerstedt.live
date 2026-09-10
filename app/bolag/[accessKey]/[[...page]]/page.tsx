import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { OsPageSkeleton } from "@/components/os/page-skeleton";
import { OverviewPage, TasksPage } from "@/components/os/pages";
import { berlinYmd } from "@/lib/os/format";
import { routeHref } from "@/lib/os/href";
import { osPath } from "@/lib/os/paths";
import { osLegacyTarget, resolveOsRoute, type OsPageSlug } from "@/lib/os/route";
import { loadOsPage } from "@/lib/os/snapshot";

async function OsPageBody({ accessKey, page }: { accessKey: string; page: OsPageSlug }) {
  if (page === "vault") {
    const { OsVault } = await import("@/components/os/vault");
    return <OsVault accessKey={accessKey} />;
  }
  const snapshot = await loadOsPage(accessKey, page);
  if (!snapshot) return null;
  const todayYmd = berlinYmd() ?? new Date().toISOString().slice(0, 10);

  switch (page) {
    case "tiktok": {
      const { TikTokPage } = await import("@/components/os/tiktok-page");
      return <TikTokPage accessKey={accessKey} snapshot={snapshot} todayYmd={todayYmd} />;
    }
    case "tasks":
      return <TasksPage accessKey={accessKey} snapshot={snapshot} todayYmd={todayYmd} />;
    case "money": {
      const { MoneyPage } = await import("@/components/os/money-page");
      return <MoneyPage accessKey={accessKey} snapshot={snapshot} />;
    }
    case "music": {
      const { MusicPage } = await import("@/components/os/music-page");
      return <MusicPage snapshot={snapshot} todayYmd={todayYmd} />;
    }
    case "settings": {
      const { SettingsPage } = await import("@/components/os/settings-page");
      return <SettingsPage accessKey={accessKey} snapshot={snapshot} />;
    }
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

  return (
    <Suspense fallback={<OsPageSkeleton />}>
      <OsPageBody accessKey={resolved.accessKey} page={resolved.page} />
    </Suspense>
  );
}
