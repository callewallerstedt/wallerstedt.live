import type { Metadata } from "next";

import { MusicBrowser } from "@/components/site/music-browser";
import { SelectedWork } from "@/components/site/sections";
import { getSiteCatalog } from "@/lib/site/catalog";
import { getSiteSettings } from "@/lib/site-settings";

export const metadata: Metadata = {
  title: "Music",
  description: "Every Wallerstedt release — EPs, singles, and slowed versions, all playable here.",
};

export default async function MusicPage() {
  const [catalog, settings] = await Promise.all([getSiteCatalog(), getSiteSettings()]);
  const bySlug = new Map(catalog.tracks.map((track) => [track.slug, track]));
  const featured = settings.featuredSongOrder
    .map((slug) => bySlug.get(slug))
    .filter((track): track is NonNullable<typeof track> => Boolean(track))
    .slice(0, 4);
  const queue = catalog.tracks.filter((track) => track.preview).map((track) => track.slug);

  return (
    <>
      <section className="wl-head">
        <div className="wl-shell wl-head__inner">
          <p className="wl-eyebrow" data-wl-reveal="0">
            Catalogue
          </p>
          <div className="wl-head__row">
            <h1 className="wl-display wl-head__title" data-wl-reveal="1">
              Music
            </h1>
            <p className="wl-lede" data-wl-reveal="2">
              {catalog.stats.releases} releases and {catalog.stats.tracks} tracks, from{" "}
              {catalog.stats.firstYear} to now. Press play on anything — it starts right here.
            </p>
          </div>
        </div>
      </section>

      <MusicBrowser releases={catalog.releases} />

      {featured.length ? (
        <SelectedWork tracks={featured} queue={queue} eyebrow="If you only hear four" title="The ones people keep." />
      ) : null}
    </>
  );
}
