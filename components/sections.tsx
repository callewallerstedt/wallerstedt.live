import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import { PlatformIcon } from "@/components/icons";
import { ReleaseCountdown } from "@/components/ReleaseCountdown";
import { SocialIconRow } from "@/components/SocialIconRow";
import { artist } from "@/lib/artist";
import { type SiteContent } from "@/lib/site-content";
import {
  type PlaylistCard,
  type SocialLink,
  type Release,
  type Song,
} from "@/lib/site-data";

function getLatestTrackHref(track: Song) {
  return { href: `/${track.slug}`, external: false };
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

function getSpotifyPlaylistEmbedFromLink(spotifyLink?: string) {
  if (!spotifyLink) {
    return null;
  }

  const playlistId = spotifyLink.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/)?.[1];
  if (!playlistId) {
    return null;
  }

  return `https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator&theme=0`;
}

function getReleaseHref(release: Release): Route {
  if (release.tracks.length === 1) {
    return `/${release.tracks[0].slug}` as Route;
  }

  return `/music/${release.slug}` as Route;
}

function isFutureRelease(releaseDate: string) {
  const parsed = new Date(releaseDate);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now();
}

function getReleaseStatusLabel(releaseDate: string) {
  return isFutureRelease(releaseDate) ? "Releases" : "Released";
}

function getReleaseEyebrow(releaseDate: string) {
  return isFutureRelease(releaseDate) ? "Upcoming release" : "Latest release";
}

function getPrimaryPlatformAction(release: Release) {
  if (release.platforms.spotify) {
    return { href: release.platforms.spotify, label: "Listen on Spotify" };
  }

  if (release.platforms.appleMusic) {
    return { href: release.platforms.appleMusic, label: "Open on Apple Music" };
  }

  return {
    href: release.allPlatforms,
    label: isFutureRelease(release.releaseDate) ? "Pre-save now" : "Listen on all platforms",
  };
}

export function HomeHeroSection({
  heroSong,
  latestRelease,
  siteContent,
}: {
  heroSong: Song;
  latestRelease: Release | null;
  siteContent: SiteContent;
}) {
  return (
    <section className="hero">
      <div className="hero-background" aria-hidden="true">
        <Image
          src={artist.profileImage}
          alt=""
          fill
          className="hero-background__image"
          sizes="100vw"
          priority
        />
      </div>
      <div className="container hero__grid">
        <div className="hero-copy">
          <h1 data-reveal>{siteContent.heroHeading}</h1>
          <div className="button-row button-row--hero" data-reveal>
            <a className="button button--primary" href={siteContent.links.spotify} target="_blank" rel="noreferrer">
              <span className="button__icon"><PlatformIcon platform="spotify" /></span>
              Listen on Spotify
            </a>
            <a
              className="button button--secondary"
              href={siteContent.links.appleMusic}
              target="_blank"
              rel="noreferrer"
            >
              <span className="button__icon"><PlatformIcon platform="appleMusic" /></span>
              Listen on Apple Music
            </a>
            <a className="button button--secondary" href={siteContent.links.patreon} target="_blank" rel="noreferrer">
              <span className="button__icon"><PlatformIcon platform="patreon" /></span>
              Support on Patreon
            </a>
            <Link className="button button--ghost" href="/music">
              View all music
            </Link>
          </div>
          <div className="hero-strip" data-reveal>
            <a className="hero-tile" href="#latest">
              <div className="hero-tile__thumb">
                {latestRelease ? (
                  <Image
                    className="cover-image"
                    src={latestRelease.art}
                    alt={`${latestRelease.title} cover art`}
                    width={160}
                    height={160}
                    sizes="80px"
                  />
                ) : null}
              </div>
              <div>
                <p className="eyebrow">{latestRelease ? getReleaseEyebrow(latestRelease.releaseDate) : "Music"}</p>
                <strong>{latestRelease?.title ?? "View music"}</strong>
              </div>
            </a>
            <Link className="hero-tile" href={`/${heroSong.slug}`}>
              <div className="hero-tile__thumb">
                <Image
                  className="cover-image"
                  src={heroSong.art}
                  alt={`${heroSong.title} cover art`}
                  width={160}
                  height={160}
                  sizes="80px"
                />
              </div>
              <div>
                <p className="eyebrow">Featured piece</p>
                <strong>{heroSong.title}</strong>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LatestReleaseSection({ latestRelease }: { latestRelease: Release | null }) {
  if (!latestRelease) {
    return null;
  }

  const primaryAction = getPrimaryPlatformAction(latestRelease);
  const showSecondaryAction = latestRelease.allPlatforms !== primaryAction.href;
  const spotifyEmbed =
    getSpotifyEmbedFromLink(latestRelease.platforms.spotify) ??
    (latestRelease.tracks.length === 1 ? latestRelease.tracks[0].embed : null);

  return (
    <section className="section section--tight" id="latest">
      <div className="container">
        <div className="section-heading" data-reveal>
          <p className="eyebrow">{getReleaseEyebrow(latestRelease.releaseDate)}</p>
          <h2>{latestRelease.title}</h2>
        </div>
        <div className="latest-surface" data-reveal>
          <div className="latest__grid">
            <aside className="latest-panel">
              <div className="cover-shell cover-shell--square">
                <Image
                  className="cover-image"
                  src={latestRelease.art}
                  alt={`${latestRelease.title} cover art`}
                  width={820}
                  height={820}
                  sizes="(max-width: 1100px) 100vw, 32vw"
                />
              </div>
              <ul className="track-list">
                {latestRelease.tracks.map((track, index) => {
                  const link = getLatestTrackHref(track);

                  return (
                    <li key={track.slug}>
                      <a
                        className="track-link"
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noreferrer" : undefined}
                      >
                        <span>{`0${index + 1}`}</span>
                        <strong>{track.title}</strong>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </aside>
            <div className="latest-copy">
              <p className="eyebrow">{getReleaseStatusLabel(latestRelease.releaseDate)} {latestRelease.releaseDate}</p>
              <h2>{latestRelease.title}</h2>
              {latestRelease.slug === "miracle" ? (
                <ReleaseCountdown targetIso="2026-03-12T00:00:00+01:00" label="Countdown" />
              ) : null}
              <div className="latest__actions button-row">
                <a
                  className={isFutureRelease(latestRelease.releaseDate) ? "button button--primary button--highlight" : "button button--primary"}
                  href={primaryAction.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {primaryAction.label}
                </a>
                {showSecondaryAction ? (
                  <a className="button button--secondary" href={latestRelease.allPlatforms} target="_blank" rel="noreferrer">
                    Listen on all platforms
                  </a>
                ) : null}
              </div>
              {spotifyEmbed ? (
                <div className="embed-frame latest__embed">
                  <iframe
                    src={spotifyEmbed}
                    loading="lazy"
                    allow="autoplay; clipboard-write; fullscreen; picture-in-picture"
                  ></iframe>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FeaturedPiecesSection({
  featuredSongs,
  eyebrow,
  title,
  compact = false,
}: {
  featuredSongs: Song[];
  eyebrow?: string;
  title?: string;
  compact?: boolean;
}) {
  return (
    <section className="section" id="featured">
      <div className="container">
        {eyebrow || title ? (
          <div className="section-heading" data-reveal>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h2>{title}</h2> : null}
          </div>
        ) : null}
        <div className={compact ? "piece-grid piece-grid--compact" : "piece-grid"} data-featured-scroller>
          {featuredSongs.map((song) => (
            <article className={compact ? "piece-card piece-card--compact" : "piece-card"} key={song.slug} data-reveal>
              <Link className="card-link-overlay" href={`/${song.slug}`} aria-label={`Open ${song.title}`} />
              <div className="piece-card__media">
                <Image
                  className="cover-image"
                  src={song.art}
                  alt={`${song.title} cover art`}
                  width={820}
                  height={820}
                  sizes="(max-width: 780px) 100vw, (max-width: 1100px) 50vw, 25vw"
                />
              </div>
              <div className="piece-card__body">
                <h3>{song.title}</h3>
                <div className="piece-card__actions">
                  <div className="card-platforms">
                    <a className="button button--platform" href={song.platforms.spotify!} target="_blank" rel="noreferrer">
                      <span className="button__icon"><PlatformIcon platform="spotify" /></span>
                      Spotify
                    </a>
                    {song.platforms.appleMusic ? (
                      <a className="button button--platform" href={song.platforms.appleMusic} target="_blank" rel="noreferrer">
                        <span className="button__icon"><PlatformIcon platform="appleMusic" /></span>
                        Apple Music
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MusicCatalogSection({ releases }: { releases: Release[] }) {
  return (
    <section className="section">
      <div className="container">
        <div className="section-heading" data-reveal>
          <p className="eyebrow">Releases</p>
          <h2>All releases</h2>
        </div>
        <div className="music-list">
          {releases.map((release) => (
            <article className="music-list-item" key={release.slug} data-reveal>
              <Link className="card-link-overlay" href={getReleaseHref(release)} aria-label={`Open ${release.title}`} />
              <div className="music-list-item__thumb">
                <div className="catalog-card__thumb catalog-card__thumb--list">
                  <Image
                    className="cover-image"
                    src={release.art}
                    alt={`${release.title} cover art`}
                    width={160}
                    height={160}
                    sizes="72px"
                  />
                </div>
              </div>
              <div className="music-list-item__copy">
                <div>
                  <p className="eyebrow">{release.releaseDate}</p>
                  <h3>{release.title}</h3>
                  <p>{release.subtitle}</p>
                </div>
              </div>
              <div className="music-list-item__actions">
                <div className="card-platforms">
                  <a className="button button--platform" href={release.platforms.spotify ?? release.allPlatforms} target="_blank" rel="noreferrer">
                    <span className="button__icon"><PlatformIcon platform="spotify" /></span>
                    Spotify
                  </a>
                  {release.platforms.appleMusic ? (
                    <a className="button button--platform" href={release.platforms.appleMusic} target="_blank" rel="noreferrer">
                      <span className="button__icon"><PlatformIcon platform="appleMusic" /></span>
                      Apple Music
                    </a>
                  ) : (
                    <a className="button button--platform" href={release.allPlatforms} target="_blank" rel="noreferrer">
                      Listen everywhere
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AboutSection() {
  return (
    <section className="section">
      <div className="container about__grid">
        <div className="about-copy" data-reveal>
          <p className="eyebrow">About</p>
          <h2>Wallerstedt</h2>
          <p>{artist.tagline}</p>
          <p>Based in Sweden, writing piano music for late evenings, focus, and quieter rooms.</p>
          <p>
            The catalog moves between short sketches, slower ambient pieces, and quietly melodic releases built for focus.
          </p>
        </div>
        <div className="about-stack">
          <figure className="about-card" data-reveal>
            <div className="cover-shell cover-shell--portrait">
              <Image
                className="cover-image"
                src="/media/artist-about.jpg"
                alt="Wallerstedt portrait"
                width={820}
                height={900}
                sizes="(max-width: 1100px) 100vw, 36vw"
              />
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}

export function PlaylistsSection({ playlists }: { playlists: PlaylistCard[] }) {
  return (
    <section className="section">
      <div className="container">
        <div className="section-heading" data-reveal>
          <p className="eyebrow">Playlists</p>
          <h2>Playlists</h2>
        </div>
        <div className="playlist-grid">
          {playlists.map((playlist) => {
            const spotifyEmbed = getSpotifyPlaylistEmbedFromLink(playlist.href);

            return (
            <article className="playlist-card" key={playlist.title} data-reveal>
              <div>
                {spotifyEmbed ? (
                  <div className="playlist-card__embed">
                    <iframe
                      src={spotifyEmbed}
                      loading="lazy"
                      allow="autoplay; clipboard-write; fullscreen; picture-in-picture"
                    ></iframe>
                  </div>
                ) : null}
                <h3>{playlist.title}</h3>
                <p>{playlist.description}</p>
              </div>
              <a className="button button--ghost playlist-card__button" href={playlist.href} target="_blank" rel="noreferrer">
                {playlist.label}
              </a>
            </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function FollowSection({ links }: { links: SocialLink[] }) {
  return (
    <section className="section">
      <div className="container social-grid">
        <div className="section-heading section-heading--center" data-reveal>
          <h2>Follow my socials to stay updated.</h2>
        </div>
        <SocialIconRow links={links} />
      </div>
    </section>
  );
}
