import { Hero } from "@/components/site/hero";
import { Marquee } from "@/components/site/marquee";
import { Chapter, Discography, LatestRelease, Playlists, SelectedWork } from "@/components/site/sections";
import { artist } from "@/lib/artist";
import { getSiteContent } from "@/lib/site-content";
import { getSiteCatalog } from "@/lib/site/catalog";
import { getSiteSettings } from "@/lib/site-settings";

function compactCount(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 0 }).format(value);
}

export default async function HomePage() {
  const [catalog, siteContent, settings] = await Promise.all([
    getSiteCatalog(),
    getSiteContent(),
    getSiteSettings(),
  ]);

  const { latest, releases, stats } = catalog;
  if (!latest) {
    return <main />;
  }

  const bySlug = new Map(catalog.tracks.map((track) => [track.slug, track]));
  const featured = settings.featuredSongOrder
    .map((slug) => bySlug.get(slug))
    .filter((track): track is NonNullable<typeof track> => Boolean(track));
  const selected = (featured.length ? featured : catalog.tracks).slice(0, 4);

  const queue = catalog.tracks.filter((track) => track.preview).map((track) => track.slug);
  const heroTrack = latest.tracks.find((track) => track.preview) ?? latest.tracks[0];

  const listeners = compactCount(artist.monthlyListeners);

  return (
    <>
      <Hero
        heading={["I make", "piano music"]}
        lede={`Self-taught, cinematic piano written in a quiet room in Gothenburg. ${listeners} people listen every month — and every track on this site plays right here.`}
        release={{ title: latest.title, art: latest.art, date: latest.releaseDate }}
        heroTrackSlug={heroTrack.slug}
        queue={queue}
        stats={[
          { value: listeners, label: "Monthly listeners" },
          { value: String(stats.releases), label: "Releases" },
          { value: String(stats.tracks), label: "Tracks" },
          { value: `${stats.firstYear}—`, label: "Recording since" },
        ]}
        spotifyHref={siteContent.links.spotify}
        appleHref={siteContent.links.appleMusic}
      />

      <Marquee
        items={releases.slice(0, 12).map((release) => `${release.title} · ${release.year}`)}
        speed={64}
      />

      <LatestRelease release={latest} />

      <SelectedWork
        tracks={selected}
        queue={queue}
        eyebrow="Selected"
        title="Start here."
        action={{ href: "/music", label: `All ${stats.releases} releases` }}
      />

      <Chapter
        stats={[
          { value: listeners, label: "Monthly listeners" },
          { value: String(stats.tracks), label: "Tracks released" },
          { value: String(stats.eps), label: "EPs" },
          { value: stats.firstYear, label: "First release" },
        ]}
      />

      <Discography releases={releases} />

      <Playlists playlists={siteContent.playlists} />
    </>
  );
}
