import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { accentVars } from "@/components/site/accent";
import { Countdown } from "@/components/site/countdown";
import { PlayButton } from "@/components/site/player";
import { PlatformGrid, Releases, SpotifyEmbed } from "@/components/site/sections";
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

  const description = `${release.title} by Wallerstedt. ${release.tracks.length} ${release.tracks.length === 1 ? "track" : "tracks"}.`;

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
  const more = catalog.releases
    .filter((entry) => entry.slug !== release.slug && entry.format !== "Version")
    .slice(0, 4);

  return (
    <div className="wl-detail" style={accentVars(release.accent)}>
      <div className="wl-detail__backdrop" aria-hidden="true">
        <Image src={release.art} alt="" width={480} height={480} priority sizes="100vw" />
      </div>

      <div className="wl-shell wl-detail__head">
        <div className="wl-detail__cover wl-intro" style={{ ["--i" as string]: 0 }}>
          <Image
            src={release.art}
            alt={`${release.title} cover art`}
            width={1000}
            height={1000}
            priority
            sizes="(max-width: 900px) 80vw, 420px"
          />
        </div>

        <div className="wl-detail__body">
          <p className="wl-detail__kicker wl-intro" style={{ ["--i" as string]: 1 }}>
            {release.format === "Version" ? "Single" : release.format} · {release.year} ·{" "}
            {release.tracks.length} {release.tracks.length === 1 ? "track" : "tracks"}
            {release.runtimeMs ? ` · ${formatRuntime(release.runtimeMs)}` : ""}
          </p>
          <h1 className="wl-display wl-intro" style={{ ["--i" as string]: 2 }}>
            {release.title}
          </h1>

          {release.upcoming ? (
            <div className="wl-intro" style={{ ["--i" as string]: 3 }}>
              <Countdown targetIso={new Date(release.releaseDate).toISOString()} />
            </div>
          ) : null}

          <div className="wl-detail__actions wl-intro" style={{ ["--i" as string]: 4 }}>
            <PlayButton slug={release.tracks[0].slug} queue={queue} label={release.title} large />
            <PlatformGrid platforms={release.platforms} more={release.allPlatforms} />
          </div>
        </div>
      </div>

      <section className="wl-section wl-section--tight">
        <div className="wl-shell wl-narrow">
          <TrackList tracks={release.tracks} queue={queue} />
          <div className="wl-detail__more" data-reveal="0">
            <SpotifyEmbed url={release.platforms.spotify} kind="album" tall={release.tracks.length > 2} />
          </div>
        </div>
      </section>

      {more.length ? <Releases releases={more} title="More music" action={{ href: "/music", label: "See all" }} /> : null}
    </div>
  );
}
