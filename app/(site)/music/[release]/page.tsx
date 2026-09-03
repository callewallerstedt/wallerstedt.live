import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { accentVars } from "@/components/site/accent";
import { Countdown } from "@/components/site/countdown";
import { ArrowIcon } from "@/components/site/icons";
import { PlatformGrid, SelectedWork, SpotifyEmbed } from "@/components/site/sections";
import { TrackList } from "@/components/site/track-list";
import { formatRuntime, getSiteCatalog } from "@/lib/site/catalog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ release: string }>;
}): Promise<Metadata> {
  const { release: slug } = await params;
  const { releases } = await getSiteCatalog();
  const release = releases.find((entry) => entry.slug === slug);
  if (!release) {
    return {};
  }

  const description = `${release.format} · ${release.releaseDate} · ${release.tracks.length} tracks by Wallerstedt.`;

  return {
    title: release.title,
    description,
    openGraph: {
      title: `${release.title} · Wallerstedt`,
      description,
      images: [{ url: release.art, width: 1000, height: 1000 }],
      type: "music.album",
      url: `https://wallerstedt.live/music/${release.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${release.title} · Wallerstedt`,
      description,
      images: [release.art],
    },
  };
}

export async function generateStaticParams() {
  const { releases } = await getSiteCatalog();
  return releases.filter((release) => release.tracks.length > 1).map((release) => ({ release: release.slug }));
}

export default async function ReleasePage({ params }: { params: Promise<{ release: string }> }) {
  const { release: slug } = await params;
  const catalog = await getSiteCatalog();
  const release = catalog.releases.find((entry) => entry.slug === slug);

  if (!release) {
    notFound();
  }

  const queue = release.tracks.map((track) => track.slug);
  const others = catalog.releases
    .filter((entry) => entry.slug !== release.slug)
    .slice(0, 4)
    .map((entry) => entry.tracks[0]);
  const globalQueue = catalog.tracks.filter((track) => track.preview).map((track) => track.slug);

  return (
    <div className="wl-detail" style={accentVars(release.accent)}>
      <div className="wl-detail__bleed" aria-hidden="true">
        <Image src={release.art} alt="" width={640} height={640} priority sizes="100vw" />
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
                src={release.art}
                alt={`${release.title} cover art`}
                width={1000}
                height={1000}
                priority
                sizes="(max-width: 900px) 92vw, 36vw"
              />
            </div>
          </div>

          <div className="wl-detail__body">
            <p className="wl-eyebrow" data-wl-reveal="0">
              {release.format}
            </p>
            <h1 className="wl-display wl-detail__title" data-wl-reveal="1">
              {release.title}
            </h1>

            <dl className="wl-facts" data-wl-reveal="2">
              <div>
                <dt>{release.upcoming ? "Releases" : "Released"}</dt>
                <dd>{release.releaseDate}</dd>
              </div>
              <div>
                <dt>Tracks</dt>
                <dd>{release.tracks.length}</dd>
              </div>
              {release.runtimeMs ? (
                <div>
                  <dt>Runtime</dt>
                  <dd>{formatRuntime(release.runtimeMs)}</dd>
                </div>
              ) : null}
            </dl>

            {release.upcoming ? (
              <div data-wl-reveal="2">
                <Countdown targetIso={new Date(release.releaseDate).toISOString()} />
              </div>
            ) : null}

            <div data-wl-reveal="3">
              <PlatformGrid platforms={release.platforms} />
            </div>

            <a className="wl-link" href={release.allPlatforms} target="_blank" rel="noreferrer">
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
              Tracklist
            </p>
            <TrackList tracks={release.tracks} queue={queue} />
          </div>
          <div data-wl-reveal="1">
            <p className="wl-eyebrow" style={{ marginBottom: 22 }}>
              Full versions
            </p>
            <SpotifyEmbed url={release.platforms.spotify} kind="album" tall />
          </div>
        </div>
      </section>

      {others.length ? (
        <SelectedWork
          tracks={others}
          queue={globalQueue}
          eyebrow="Keep listening"
          title="More from the catalogue."
          action={{ href: "/music", label: "All releases" }}
        />
      ) : null}
    </div>
  );
}
