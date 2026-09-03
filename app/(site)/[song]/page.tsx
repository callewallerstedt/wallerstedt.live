import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { accentVars } from "@/components/site/accent";
import { ArrowIcon } from "@/components/site/icons";
import { PlayButton } from "@/components/site/player";
import { PlatformGrid, SelectedWork, SpotifyEmbed } from "@/components/site/sections";
import { TrackList } from "@/components/site/track-list";
import { formatDuration, getSiteCatalog } from "@/lib/site/catalog";

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

  const description = track.note || `${track.title} — piano by Wallerstedt, released ${track.releaseDate}.`;

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
  const siblings = release?.tracks.filter((entry) => entry.slug !== track.slug) ?? [];
  const globalQueue = catalog.tracks.filter((entry) => entry.preview).map((entry) => entry.slug);
  const more = catalog.tracks
    .filter((entry) => entry.releaseSlug !== track.releaseSlug)
    .slice(0, 4);

  return (
    <div className="wl-detail" style={accentVars(track.accent)}>
      <div className="wl-detail__bleed" aria-hidden="true">
        <Image src={track.art} alt="" width={640} height={640} priority sizes="100vw" />
      </div>

      <div className="wl-shell">
        <Link className="wl-back" href="/music">
          <ArrowIcon direction="left" />
          All music
        </Link>

        <div className="wl-detail__head">
          <div data-wl-reveal="0">
            <div className="wl-cover">
              <Image
                src={track.art}
                alt={`${track.title} cover art`}
                width={1000}
                height={1000}
                priority
                sizes="(max-width: 900px) 92vw, 36vw"
              />
            </div>
          </div>

          <div className="wl-detail__body">
            <p className="wl-eyebrow" data-wl-reveal="0">
              {release && release.tracks.length > 1 ? (
                <Link href={`/music/${release.slug}` as Route}>{release.title}</Link>
              ) : (
                "Single"
              )}
            </p>
            <h1 className="wl-display wl-detail__title" data-wl-reveal="1">
              {track.shortTitle}
            </h1>
            {track.variant ? (
              <p className="wl-meta" data-wl-reveal="1">
                {track.variant} version
              </p>
            ) : null}

            {track.note ? (
              <p className="wl-quote" data-wl-reveal="2">
                {track.note}
              </p>
            ) : null}

            <div className="wl-btn-row" data-wl-reveal="2">
              <PlayButton slug={track.slug} queue={globalQueue} label={track.title} large />
              <dl className="wl-facts">
                <div>
                  <dt>Released</dt>
                  <dd>{track.releaseDate}</dd>
                </div>
                <div>
                  <dt>Length</dt>
                  <dd>{formatDuration(track.durationMs)}</dd>
                </div>
              </dl>
            </div>

            <div data-wl-reveal="3">
              <PlatformGrid platforms={track.platforms} />
            </div>

            <a className="wl-link" href={track.allPlatforms} target="_blank" rel="noreferrer">
              Every platform
              <ArrowIcon />
            </a>
          </div>
        </div>
      </div>

      <section className="wl-section wl-section--tight">
        <div className="wl-shell wl-columns">
          <div data-wl-reveal="0">
            <p className="wl-eyebrow" style={{ marginBottom: 22 }}>
              Full track
            </p>
            <SpotifyEmbed url={track.platforms.spotify} kind="track" />
          </div>
          {siblings.length ? (
            <div data-wl-reveal="1">
              <p className="wl-eyebrow" style={{ marginBottom: 22 }}>
                Also on {release?.title}
              </p>
              <TrackList tracks={siblings} queue={release?.tracks.map((entry) => entry.slug)} />
            </div>
          ) : null}
        </div>
      </section>

      {more.length ? (
        <SelectedWork
          tracks={more}
          queue={globalQueue}
          eyebrow="Next"
          title="Something else."
          action={{ href: "/music", label: "All music" }}
        />
      ) : null}
    </div>
  );
}
