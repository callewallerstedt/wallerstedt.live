import type { Metadata } from "next";

import { MusicBrowser } from "@/components/site/music-browser";
import { PageHead } from "@/components/site/sections";
import { getSiteCatalog } from "@/lib/site/catalog";

export const metadata: Metadata = {
  title: "Music",
  description: "Every Wallerstedt release. EPs, singles, slowed and sped up versions.",
};

export default async function MusicPage() {
  const catalog = await getSiteCatalog();

  return (
    <>
      <PageHead title="Music" />
      <MusicBrowser releases={catalog.releases} />
    </>
  );
}
