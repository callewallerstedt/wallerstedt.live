import { Hero } from "@/components/site/hero";
import { About, Playlists, Popular, Releases, SignupBand } from "@/components/site/sections";
import { getSiteContent } from "@/lib/site-content";
import { getSiteCatalog } from "@/lib/site/catalog";
import { compactCount, getMonthlyListeners } from "@/lib/site/listeners";
import { getPlaylists } from "@/lib/site/playlists";
import { getSiteSettings } from "@/lib/site-settings";

export default async function HomePage() {
  const [catalog, siteContent, settings, listeners] = await Promise.all([
    getSiteCatalog(),
    getSiteContent(),
    getSiteSettings(),
    getMonthlyListeners(),
  ]);

  const { releases } = catalog;
  const playlists = await getPlaylists(siteContent.playlists);
  // Lead with whatever came out last, sped up / slowed versions included.
  const latest = catalog.newest;
  if (!latest) {
    return <main />;
  }

  const bySlug = new Map(catalog.tracks.map((track) => [track.slug, track]));
  const featured = settings.featuredSongOrder
    .map((slug) => bySlug.get(slug))
    .filter((track): track is NonNullable<typeof track> => Boolean(track));
  const popular = (featured.length ? featured : catalog.tracks).slice(0, 5);

  const queue = catalog.tracks.filter((track) => track.preview).map((track) => track.slug);
  const heroTrack = latest.tracks.find((track) => track.preview) ?? latest.tracks[0];
  const originals = releases.filter((release) => release.format !== "Version");

  return (
    <>
      <Hero
        release={{
          title: latest.title,
          art: latest.art,
          href: latest.href,
          upcoming: latest.upcoming,
          platforms: latest.platforms,
          allPlatforms: latest.allPlatforms,
        }}
        heroTrackSlug={heroTrack.slug}
        queue={queue}
        listeners={compactCount(listeners)}
        spotifyHref={siteContent.links.spotify}
      />

      <Popular tracks={popular} queue={popular.map((track) => track.slug)} />

      <SignupBand art={latest.art} />

      <Releases
        releases={originals.slice(0, 8)}
        action={originals.length > 8 || originals.length < releases.length ? { href: "/music", label: "See all" } : undefined}
      />

      <Playlists playlists={playlists} title="Playlists" action={{ href: "/playlists", label: "See all" }} />

      <About />
    </>
  );
}
