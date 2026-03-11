import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import { ReleaseCountdown } from "@/components/ReleaseCountdown";
import { FeaturedPiecesSection, FollowSection, MusicCatalogSection } from "@/components/sections";
import { getSiteContent, getSocialLinks } from "@/lib/site-content";
import { getCatalogReleases, getCatalogSongs } from "@/lib/site-data";
import { getSiteSettings } from "@/lib/site-settings";

export default async function MusicPage() {
  const [settings, siteContent, catalogSongs, releases] = await Promise.all([
    getSiteSettings(),
    getSiteContent(),
    getCatalogSongs(),
    getCatalogReleases(),
  ]);
  const songs = Object.fromEntries(catalogSongs.map((song) => [song.slug, song]));
  const featuredSongs = settings.featuredSongOrder.map((slug) => songs[slug]).filter(Boolean);
  const latestRelease = releases[0] ?? null;
  const singleCount = releases.filter((release) => /single/i.test(release.subtitle)).length;
  const epCount = releases.filter((release) => /ep/i.test(release.subtitle)).length;
  const trackCount = catalogSongs.length;

  return (
    <main className="music-page">
      <section className="section music-overview">
        <div className="container music-overview__grid">
          <div className="music-overview__copy" data-reveal>
            {latestRelease ? (
              <>
                <p className="eyebrow">Upcoming release</p>
                <div className="music-overview__art">
                  <Image
                    className="cover-image"
                    src={latestRelease.art}
                    alt={`${latestRelease.title} cover art`}
                    width={900}
                    height={900}
                    sizes="(max-width: 780px) 100vw, 360px"
                  />
                </div>
                <h1>{latestRelease.title}</h1>
                <p className="music-overview__meta">{latestRelease.releaseDate}</p>
                {latestRelease.slug === "miracle" ? (
                  <ReleaseCountdown targetIso="2026-03-12T00:00:00+01:00" label="Countdown" />
                ) : null}
                <div className="button-row">
                  <a className="button button--primary button--highlight" href={latestRelease.allPlatforms} target="_blank" rel="noreferrer">
                    Pre-save now
                  </a>
                  <Link className="button button--primary" href={`/music/${latestRelease.slug}` as Route}>
                    View release
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow">Music</p>
                <h1>Music</h1>
              </>
            )}
            <div className="music-overview__stats">
              <article className="music-stat">
                <strong>{releases.length}</strong>
                <span>releases</span>
              </article>
              <article className="music-stat">
                <strong>{singleCount}</strong>
                <span>singles</span>
              </article>
              <article className="music-stat">
                <strong>{epCount}</strong>
                <span>EPs</span>
              </article>
              <article className="music-stat">
                <strong>{trackCount}</strong>
                <span>tracks</span>
              </article>
            </div>
          </div>
        </div>
      </section>
      <FeaturedPiecesSection featuredSongs={featuredSongs} compact />
      <MusicCatalogSection releases={releases} />
      <FollowSection links={getSocialLinks(siteContent)} />
    </main>
  );
}
