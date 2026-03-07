import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PlatformIcon } from "@/components/icons";
import { getSong, songs, type SongSlug } from "@/lib/site-data";

const suggestedSongSlugs: SongSlug[] = ["september", "bon-voyage", "emergence", "solace"];
const fallbackSongSlugs: SongSlug[] = ["midnight", "memories", "coalescence", "dawn"];

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(songs).map((slug) => ({ song: slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ song: string }> }): Promise<Metadata> {
  const { song: slug } = await params;
  const song = getSong(slug);
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
  const song = getSong(slug);
  if (!song) {
    notFound();
  }

  const relatedSongs = [...suggestedSongSlugs, ...fallbackSongSlugs]
    .filter((candidateSlug, index, allSlugs) => allSlugs.indexOf(candidateSlug) === index)
    .filter((candidateSlug) => candidateSlug !== song.slug)
    .map((candidateSlug) => songs[candidateSlug])
    .filter(Boolean)
    .slice(0, 4);

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
              <strong>{song.subtitle}</strong>
            </div>
            <div>
              <p className="eyebrow">Released</p>
              <strong>{song.releaseDate}</strong>
            </div>
            <div>
              <p className="eyebrow">Streaming</p>
              <strong>{availableCount} platforms</strong>
            </div>
          </div>
          <p className="song-meta">
            <span>{song.subtitle}</span>
            <span>{song.releaseDate}</span>
          </p>
          <div className="song-listen-panel">
            <div className="platform-grid platform-grid--song">
              {listenButtons.map((platform) => (
                <a key={platform.key} className="platform-button platform-button--song" href={platform.href} target="_blank" rel="noreferrer">
                  <span className="platform-icon"><PlatformIcon platform={platform.key} /></span>
                  <span>{platform.label}</span>
                </a>
              ))}
            </div>
          </div>
          <div className="embed-frame">
            <iframe
              src={song.embed}
              loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            ></iframe>
          </div>
          <section className="song-more">
            <div className="section-heading section-heading--sub">
              <h2>You might like</h2>
            </div>
            <div className="catalog-grid catalog-grid--related">
              {relatedSongs.map((related) => (
                <article className="piece-card piece-card--related" key={related.slug}>
                  <Link className="card-link-overlay" href={`/${related.slug}`} aria-label={`Open ${related.title}`} />
                  <div className="piece-card__media">
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
                    <p>{related.subtitle}</p>
                    <div className="card-platforms">
                      {related.platforms.spotify ? (
                        <a className="button button--platform button--platform-icon" href={related.platforms.spotify} target="_blank" rel="noreferrer" aria-label={`Open ${related.title} on Spotify`}>
                          <span className="button__icon"><PlatformIcon platform="spotify" /></span>
                        </a>
                      ) : null}
                      {related.platforms.appleMusic ? (
                        <a className="button button--platform button--platform-icon" href={related.platforms.appleMusic} target="_blank" rel="noreferrer" aria-label={`Open ${related.title} on Apple Music`}>
                          <span className="button__icon"><PlatformIcon platform="appleMusic" /></span>
                        </a>
                      ) : null}
                    </div>
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
