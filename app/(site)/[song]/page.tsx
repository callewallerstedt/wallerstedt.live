import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { accentVars } from "@/components/site/accent";
import { PlayButton } from "@/components/site/player";
import { PlatformGrid, Releases, SpotifyEmbed } from "@/components/site/sections";
import { TrackList } from "@/components/site/track-list";
import { getSiteCatalog } from "@/lib/site/catalog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ song: string }>;
}): Promise<Metadata> {
  const { song: slug } = await params;
  const { tracks } = await getSiteCatalog();
  const track = tracks.find((entry) => entry.slug === slug);
  if (!track) {
    return {};
  }

  const description = `${track.title} by Wallerstedt. Listen on Spotify, Apple Music and more.`;

  return {
    title: track.title,
    description,
    openGraph: {
      title: `${track.title} · Wallerstedt`,
      description,
      images: [{ url: track.art, width: 1000, height: 1000 }],
      type: "music.song",
      url: `https://wallerstedt.live/${track.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${track.title} · Wallerstedt`,
      description,
      images: [track.art],
    },
  };
}

export async function generateStaticParams() {
  const { tracks } = await getSiteCatalog();
  return tracks.map((track) => ({ song: track.slug }));
}

export default async function SongPage({ params }: { params: Promise<{ song: string }> }) {
  const { song: slug } = await params;
  const catalog = await getSiteCatalog();
  const track = catalog.tracks.find((entry) => entry.slug === slug);

  if (!track) {
    notFound();
  }

  const release = catalog.releases.find((entry) => entry.slug === track.releaseSlug);
  const releaseQueue = release?.tracks.map((entry) => entry.slug) ?? [track.slug];
  const more = catalog.releases
    .filter((entry) => entry.slug !== track.releaseSlug && entry.format !== "Version")
    .slice(0, 4);

  return (
    <div className="wl-detail" style={accentVars(track.accent)}>
      <div className="wl-detail__backdrop" aria-hidden="true">
        <Image src={track.art} alt="" width={480} height={480} priority sizes="100vw" />
      </div>

      <div className="wl-shell wl-detail__head">
        <div className="wl-detail__cover wl-intro" style={{ ["--i" as string]: 0 }}>
          <Image
            src={track.art}
            alt={`${track.title} cover art`}
            width={1000}
            height={1000}
            priority
            sizes="(max-width: 900px) 80vw, 420px"
          />
        </div>

        <div className="wl-detail__body">
          <p className="wl-detail__kicker wl-intro" style={{ ["--i" as string]: 1 }}>
            {release && release.tracks.length > 1 ? (
              <Link href={release.href as Route}>{release.title}</Link>
            ) : (
              "Single"
            )}
            {" · "}
            {track.year}
          </p>
          <h1 className="wl-display wl-intro" style={{ ["--i" as string]: 2 }}>
            {track.shortTitle}
          </h1>
          {track.variant ? (
            <p className="wl-muted wl-intro" style={{ ["--i" as string]: 3 }}>
              {track.variant}
            </p>
          ) : null}

          <div className="wl-detail__actions wl-intro" style={{ ["--i" as string]: 4 }}>
            <PlayButton slug={track.slug} queue={releaseQueue} label={track.title} large />
            <PlatformGrid platforms={track.platforms} more={track.allPlatforms} />
          </div>
        </div>
      </div>

      <section className="wl-section wl-section--tight">
        <div className="wl-shell wl-narrow">
          <div data-reveal="0">
            <SpotifyEmbed url={track.platforms.spotify} kind="track" />
          </div>
          {release && release.tracks.length > 1 ? (
            <div className="wl-detail__more" data-reveal="1">
              <h2 className="wl-h3">More from {release.title}</h2>
              <TrackList tracks={release.tracks} queue={releaseQueue} />
            </div>
          ) : null}
        </div>
      </section>

      {more.length ? <Releases releases={more} title="More music" action={{ href: "/music", label: "See all" }} /> : null}
    </div>
  );
}
