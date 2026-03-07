import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import { PlatformIcon } from "@/components/icons";
import { SocialIconRow } from "@/components/SocialIconRow";
import {
  artist,
  catalogReleases,
  catalogSongs,
  latestRelease,
  playlists,
  socialLinks,
  songs,
  type Release,
  type Song,
} from "@/lib/site-data";

function getLatestTrackHref(track: string) {
  const matchingSong = songs[track];
  if (matchingSong) {
    return { href: `/${matchingSong.slug}`, external: false };
  }

  return { href: latestRelease.allPlatforms, external: true };
}

export function HomeHeroSection({ heroSong }: { heroSong: Song }) {
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
          <h1 data-reveal>I make piano music :)</h1>
          <div className="button-row button-row--hero" data-reveal>
            <a className="button button--primary" href={artist.spotify} target="_blank" rel="noreferrer">
              <span className="button__icon"><PlatformIcon platform="spotify" /></span>
              Listen on Spotify
            </a>
            <a
              className="button button--secondary"
              href="https://music.apple.com/us/artist/wallerstedt/1689400214"
              target="_blank"
              rel="noreferrer"
            >
              <span className="button__icon"><PlatformIcon platform="appleMusic" /></span>
              Listen on Apple Music
            </a>
            <a className="button button--secondary" href={socialLinks.find((link) => link.key === "patreon")?.href} target="_blank" rel="noreferrer">
              <span className="button__icon"><PlatformIcon platform="patreon" /></span>
              Support on Patreon
            </a>
            <Link className="button button--ghost" href="/music">
              View all music
            </Link>
          </div>
          <div className="hero-strip" data-reveal>
            <Link className="hero-tile" href="/#latest">
              <div className="hero-tile__thumb">
                <Image
                  className="cover-image"
                  src={latestRelease.art}
                  alt={`${latestRelease.displayTitle} cover art`}
                  width={160}
                  height={160}
                  sizes="80px"
                />
              </div>
              <div>
                <p className="eyebrow">Latest release</p>
                <strong>{latestRelease.displayTitle}</strong>
              </div>
            </Link>
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
          <div className="artist-mini-card" data-reveal>
            <Image
              className="artist-mini-card__image"
              src={artist.profileImage}
              alt={`${artist.name} portrait`}
              width={112}
              height={112}
              sizes="112px"
            />
            <div className="artist-mini-card__body">
              <p className="eyebrow">About me</p>
              <h2>{artist.name}</h2>
              <p>{artist.bio}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LatestReleaseSection() {
  return (
    <section className="section section--tight" id="latest">
      <div className="container">
        <div className="section-heading" data-reveal>
          <p className="eyebrow">Latest release</p>
          <h2>{latestRelease.displayTitle}</h2>
        </div>
        <div className="latest__grid">
          <aside className="latest-panel" data-reveal>
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
                  <li key={track}>
                    <a
                      className="track-link"
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noreferrer" : undefined}
                    >
                      <span>{`0${index + 1}`}</span>
                      <strong>{track}</strong>
                    </a>
                  </li>
                );
              })}
            </ul>
          </aside>
          <div data-reveal>
            <p className="eyebrow">Released {latestRelease.releaseDate}</p>
            <h2>{latestRelease.displayTitle}</h2>
            <div className="latest__actions button-row">
              <a className="button button--primary" href={latestRelease.platforms.spotify!} target="_blank" rel="noreferrer">
                Listen on Spotify
              </a>
              <a className="button button--secondary" href={latestRelease.allPlatforms} target="_blank" rel="noreferrer">
                Listen on all platforms
              </a>
            </div>
            <div className="embed-frame">
              <iframe
                src={latestRelease.embed}
                loading="lazy"
                allow="autoplay; clipboard-write; fullscreen; picture-in-picture"
              ></iframe>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FeaturedPiecesSection({
  featuredSongs,
  eyebrow = "Featured",
  title = "Pieces",
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
        <div className="section-heading" data-reveal>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <div className={compact ? "piece-grid piece-grid--compact" : "piece-grid"}>
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
                <p className="eyebrow">Featured piece</p>
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

export function MusicCatalogSection() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-heading" data-reveal>
          <p className="eyebrow">Releases</p>
          <h2>All releases</h2>
        </div>
        <div className="music-list">
          {catalogReleases.map((release) => (
            <article className="music-list-item" key={release.slug} data-reveal>
              <Link className="card-link-overlay" href={`/music/${release.slug}` as Route} aria-label={`Open ${release.title}`} />
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
          <h2>Calle Wallerstedt</h2>
          <p>{artist.tagline}</p>
          <p>Based in Sweden, writing piano music for late evenings, focus, and quieter rooms.</p>
          <p>
            The catalog moves between short sketches, slower ambient pieces, and release cycles like{" "}
            <em>{latestRelease.title}</em>.
          </p>
        </div>
        <div className="about-stack">
          <figure className="about-card" data-reveal>
            <div className="cover-shell cover-shell--portrait">
              <Image
                className="cover-image"
                src="/media/artist-about.jpg"
                alt="Calle Wallerstedt portrait"
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

export function PlaylistsSection() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-heading" data-reveal>
          <p className="eyebrow">Playlists</p>
          <h2>Listen while studying or relaxing.</h2>
        </div>
        <div className="playlist-grid">
          {playlists.map((playlist) => (
            <article className="playlist-card" key={playlist.title} data-reveal>
              <div>
                <h3>{playlist.title}</h3>
                <p>{playlist.description}</p>
              </div>
              <a className="button button--ghost playlist-card__button" href={playlist.href} target="_blank" rel="noreferrer">
                {playlist.label}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FollowSection() {
  return (
    <section className="section">
      <div className="container social-grid">
        <div className="section-heading" data-reveal>
          <h2>Follow my socials to stay updated.</h2>
        </div>
        <SocialIconRow links={socialLinks} />
      </div>
    </section>
  );
}
