import type { Metadata } from "next";

import { MusicBrowser } from "@/components/site/music-browser";
import { PageHead } from "@/components/site/sections";
import { getSiteCatalog, type SiteRelease } from "@/lib/site/catalog";

export const metadata: Metadata = {
  title: "Music",
  description: "Every Wallerstedt release. EPs, singles, slowed and sped up versions.",
};

export default async function MusicPage() {
  const catalog = await getSiteCatalog();

  // Slowed / sped-up versions often sit inside a single next to the original,
  // so each one gets its own tile.
  const versionsOf = (release: SiteRelease): SiteRelease[] =>
    release.tracks
      .filter((track) => track.variant === "slowed + reverb" || track.variant === "sped up")
      .map((track) => ({
        ...release,
        slug: track.slug,
        title: track.shortTitle,
        format: "Version" as const,
        art: track.art,
        href: `/${track.slug}`,
        tracks: [track],
        runtimeMs: track.durationMs ?? 0,
      }));
  const versions = catalog.releases.flatMap(versionsOf);
  // "All" keeps whole releases, plus the versions tucked inside them right after the original.
  const all = catalog.releases.flatMap((release) =>
    release.format === "Version" ? [release] : [release, ...versionsOf(release)],
  );

  return (
    <>
      <PageHead title="Music" />
      <MusicBrowser releases={catalog.releases} all={all} versions={versions} />
    </>
  );
}
