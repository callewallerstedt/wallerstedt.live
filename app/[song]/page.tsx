import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Route } from "next";

import { PlatformIcon } from "@/components/icons";
import { getCatalogSongs, getReleaseForSongSlug, getSongBySlug, type SongSlug } from "@/lib/site-data";

const suggestedSongSlugs: SongSlug[] = ["september", "bon-voyage", "emergence", "solace"];
const fallbackSongSlugs: SongSlug[] = ["midnight", "memories", "coalescence", "dawn"];

function getReleaseLabel(releaseDate: string, hasLivePlatformLink: boolean) {
  if (hasLivePlatformLink) {
    return "Released";
  }

  const parsed = new Date(releaseDate);
  if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
    return "Releases";
  }

  return "Released";
}

function getReleaseTypeLabel(subtitle: string) {
  return "Single";
}

function getFallbackActionLabel(releaseDate: string) {
  const parsed = new Date(releaseDate);
  if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
    return "Pre-save now";
  }

  return "Listen everywhere";
}

export async function generateMetadata({ params }: { params: Promise<{ song: string }> }): Promise<Metadata> {
  const { song: slug } = await params;
  const song = await getSongBySlug(slug);
  if (!song) {
    return {};
  }

  return {
    title: song.title,
    description: `${song.title} | Wallerstedt`,
    openGraph: {
      title: `${song.title} | Wallerstedt`,
      description: `${song.title} | Wallerstedt`,
      images: [{ url: song.art, width: 512, height: 512 }],
      type: "music.song",
      url: `https://wallerstedt.live/${song.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${song.title} | Wallerstedt`,
      description: `${song.title} | Wallerstedt`,
      images: [song.art],
    },
  };
}

export default async function SongPage({ params }: { params: Promise<{ song: SongSlug }> }) {
  const { song: slug } = await params;
  const [song, catalogSongs] = await Promise.all([getSongBySlug(slug), getCatalogSongs()]);
  if (!song) {
    notFound();
  }

  const songs = Object.fromEntries(catalogSongs.map((entry) => [entry.slug, entry]));
  const relatedSongs = [...suggestedSongSlugs, ...fallbackSongSlugs]
    .filter((candidateSlug, index, allSlugs) => allSlugs.indexOf(candidateSlug) === index)
    .filter((candidateSlug) => candidateSlug !== song.slug)
    .map((candidateSlug) => songs[candidateSlug])
    .filter(Boolean)
    .slice(0, 4);
  const parentRelease = await getReleaseForSongSlug(song.slug);
  const parentReleaseHref = parentRelease && parentRelease.tracks.length > 1 ? (`/music/${parentRelease.slug}` as Route) : null;

  const availableCount = Object.values(song.platforms).filter(Boolean).length;
  const listenButtons: Array<{
    key: "spotify" | "appleMusic" | "amazonMusic" | "deezer" | "tidal";
    label: string;
    href: string;
  }> = [
    song.platforms.spotify ? { key: "spotify", label: "Spotify", href: song.platforms.spotify } : null,
    song.platforms.appleMusic ? { key: "appleMusic", label: "Apple Music", href: song.platforms.appleMusic } : null,
    song.platforms.amazonMusic ? { key: "amazonMusic", label: "Amazon Music", href: song.platforms.amazonMusic } : null,
    song.platforms.deezer ? { key: "deezer", label: "Deezer", href: song.platforms.deezer } : null,
    song.platforms.tidal ? { key: "tidal", label: "TIDAL", href: song.platforms.tidal } : null,
  ].filter(
    (
      platform,
    ): platform is {
      key: "spotify" | "appleMusic" | "amazonMusic" | "deezer" | "tidal";
      label: string;
      href: string;
    } => Boolean(platform),
  );

  return (
    <main className="song-main">
      <div className="song-backdrop" aria-hidden="true">
        <Image src={song.art} alt="" fill className="song-backdrop__image" sizes="100vw" />
      </div>
      <div className="container song-hero">
        <section className="song-copy" data-reveal>
          <h1>{song.title}</h1>
          <div className="song-info-grid">
            <div>
              <p className="eyebrow">From</p>
              {parentReleaseHref ? (
                <strong>
                  <Link className="text-link" href={parentReleaseHref}>
                    {song.subtitle}
                  </Link>
                </strong>
              ) : (
                <strong>{song.subtitle}</strong>
              )}
            </div>
            <div>
              <p className="eyebrow">{getReleaseLabel(song.releaseDate, availableCount > 0)}</p>
              <strong>{song.releaseDate}</strong>
            </div>
            <div>
              <p className="eyebrow">Streaming</p>
              <strong>{availableCount} platforms</strong>
            </div>
          </div>
          <div className="song-listen-panel">
            <div className="platform-grid platform-grid--song">
              {listenButtons.map((platform) => (
                <a key={platform.key} className="platform-button platform-button--song" href={platform.href} target="_blank" rel="noreferrer">
                  <span className="platform-icon"><PlatformIcon platform={platform.key} /></span>
                  <span>{platform.label}</span>
                </a>
              ))}
              {!listenButtons.length && song.allPlatforms ? (
                <a
                  className={getFallbackActionLabel(song.releaseDate) === "Pre-save now"
                    ? "platform-button platform-button--song platform-button--highlight"
                    : "platform-button platform-button--song"}
                  href={song.allPlatforms}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{getFallbackActionLabel(song.releaseDate)}</span>
                </a>
              ) : null}
            </div>
          </div>
          {song.embed ? (
            <div className="embed-frame">
              <iframe
                src={song.embed}
                loading="lazy"
                allow="autoplay; clipboard-write; fullscreen; picture-in-picture"
              ></iframe>
            </div>
          ) : null}
          <section className="song-more">
            <div className="section-heading section-heading--sub">
              <h2>You might like</h2>
            </div>
            <div className="catalog-grid catalog-grid--related">
              {relatedSongs.map((related) => (
                <article className="piece-card piece-card--related" key={related.slug}>
                  <Link className="card-link-overlay" href={`/${related.slug}`} aria-label={`Open ${related.title}`} />
                  <div className="piece-card__media">
                    <span className="piece-card__badge">{getReleaseTypeLabel(related.subtitle)}</span>
                    <Image
                      className="cover-image"
                      src={related.art}
                      alt={`${related.title} cover art`}
                      width={820}
                      height={820}
                      sizes="(max-width: 780px) 100vw, (max-width: 1100px) 50vw, 25vw"
                    />
                  </div>
                  <div className="piece-card__body piece-card__body--related">
                    <h3>{related.title}</h3>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
