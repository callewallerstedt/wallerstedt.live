import { ContentPage } from "@/components/os/pages";
import { loadOsPage } from "@/lib/os/snapshot";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ accessKey: string }>;
}) {
  const { accessKey } = await params;
  const snapshot = await loadOsPage(accessKey);
  if (!snapshot) return null;
  return <ContentPage snapshot={snapshot} />;
}
