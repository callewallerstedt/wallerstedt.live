import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PlatformIcon } from "@/components/icons";
import { ReleaseCountdown } from "@/components/ReleaseCountdown";
import { getReleaseBySlug } from "@/lib/site-data";

export async function generateMetadata({ params }: { params: Promise<{ release: string }> }): Promise<Metadata> {
  const { release: slug } = await params;
  const release = await getReleaseBySlug(slug);
  if (!release) {
    return {};
  }

  return {
    title: release.title,
    description: `${release.subtitle} | Wallerstedt`,
    openGraph: {
      title: `${release.title} | Wallerstedt`,
      description: `${release.subtitle} | Wallerstedt`,
      images: [{ url: release.art, width: 512, height: 512 }],
      type: "music.album",
      url: `https://wallerstedt.live/music/${release.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${release.title} | Wallerstedt`,
      description: `${release.subtitle} | Wallerstedt`,
      images: [release.art],
    },
  };
}

function getSpotifyEmbedFromLink(spotifyLink?: string) {
  if (!spotifyLink) {
    return null;
  }

  const trackId = spotifyLink.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/)?.[1];
  if (trackId) {
    return `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;
  }

  const albumId = spotifyLink.match(/open\.spotify\.com\/album\/([A-Za-z0-9]+)/)?.[1];
  if (albumId) {
    return `https://open.spotify.com/embed/album/${albumId}?utm_source=generator&theme=0`;
  }

  return null;
}

function getReleaseLabel(releaseDate: string) {
  const parsed = new Date(releaseDate);
  if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
    return "Releases";
  }

  return "Released";
}

function getFallbackActionLabel(releaseDate: string) {
  const parsed = new Date(releaseDate);
  if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
    return "Pre-save now";
  }

  return "Listen everywhere";
}

export default async function ReleasePage({ params }: { params: Promise<{ release: string }> }) {
  const { release: slug } = await params;
  const release = await getReleaseBySlug(slug);
  if (!release) {
    notFound();
  }
  const hasSingleTrack = release.tracks.length === 1;
  const spotifyEmbed = getSpotifyEmbedFromLink(release.platforms.spotify) ?? (hasSingleTrack ? release.tracks[0].embed : null);

  const listenButtons: Array<{
    key: "spotify" | "appleMusic" | "amazonMusic" | "deezer" | "tidal";
    label: string;
    href: string;
  }> = [
    release.platforms.spotify ? { key: "spotify", label: "Spotify", href: release.platforms.spotify } : null,
    release.platforms.appleMusic ? { key: "appleMusic", label: "Apple Music", href: release.platforms.appleMusic } : null,
    release.platforms.amazonMusic ? { key: "amazonMusic", label: "Amazon Music", href: release.platforms.amazonMusic } : null,
    release.platforms.deezer ? { key: "deezer", label: "Deezer", href: release.platforms.deezer } : null,
    release.platforms.tidal ? { key: "tidal", label: "TIDAL", href: release.platforms.tidal } : null,
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
        <Image src={release.art} alt="" fill className="song-backdrop__image" sizes="100vw" />
      </div>
      <div className="container song-hero">
        <section className="song-copy" data-reveal>
          <p className="eyebrow">Release</p>
          <h1>{release.title}</h1>
          <div className="song-info-grid">
            <div>
              <p className="eyebrow">Type</p>
              <strong>{release.subtitle}</strong>
            </div>
            <div>
              <p className="eyebrow">{getReleaseLabel(release.releaseDate)}</p>
              <strong>{release.releaseDate}</strong>
            </div>
            <div>
              <p className="eyebrow">Tracks</p>
              <strong>{release.tracks.length}</strong>
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
              {!listenButtons.length ? (
                <a
                  className={getFallbackActionLabel(release.releaseDate) === "Pre-save now"
                    ? "platform-button platform-button--song platform-button--highlight"
                    : "platform-button platform-button--song"}
                  href={release.allPlatforms}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{getFallbackActionLabel(release.releaseDate)}</span>
                </a>
              ) : null}
            </div>
          </div>
          {release.slug === "miracle" ? (
            <ReleaseCountdown targetIso="2026-03-12T00:00:00+01:00" label="Countdown" />
          ) : null}
          {spotifyEmbed ? (
            <div className="embed-frame">
              <iframe
                src={spotifyEmbed}
                loading="lazy"
                allow="autoplay; clipboard-write; fullscreen; picture-in-picture"
              ></iframe>
            </div>
          ) : null}
          {!hasSingleTrack ? (
            <section className="release-track-panel">
              <div className="section-heading section-heading--sub release-track-panel__heading">
                <h2>Tracks</h2>
              </div>
              <ul className="track-list">
                {release.tracks.map((track, index) => (
                  <li key={track.slug}>
                    <div className="release-track-row">
                      <Link className="track-link" href={`/${track.slug}`}>
                        <span>{`${index + 1}`.padStart(2, "0")}</span>
                        <strong>{track.title}</strong>
                      </Link>
                      <div className="release-track-row__actions">
                        {track.platforms.spotify ? (
                          <a
                            className="button button--platform button--platform-icon release-track-row__icon"
                            href={track.platforms.spotify}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${track.title} on Spotify`}
                          >
                            <span className="button__icon"><PlatformIcon platform="spotify" /></span>
                          </a>
                        ) : null}
                        {track.platforms.appleMusic ? (
                          <a
                            className="button button--platform button--platform-icon release-track-row__icon"
                            href={track.platforms.appleMusic}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${track.title} on Apple Music`}
                          >
                            <span className="button__icon"><PlatformIcon platform="appleMusic" /></span>
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}
