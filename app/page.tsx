import Image from "next/image";
import Link from "next/link";

import { PlatformIcon } from "@/components/icons";
import { SocialIconRow } from "@/components/SocialIconRow";
import { artist, catalogSongs, featuredSongOrder, latestRelease, playlists, socialLinks, songs } from "@/lib/site-data";

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="container hero__grid">
          <div className="hero-copy">
            <h1 data-reveal>hi! I make piano music :)</h1>
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
              <Link className="button button--ghost" href="/#pieces">
                View All Pieces
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
              <Link className="hero-tile" href="/midnight">
                <div className="hero-tile__thumb">
                  <Image
                    className="cover-image"
                    src={songs.midnight.art}
                    alt="midnight cover art"
                    width={160}
                    height={160}
                    sizes="80px"
                  />
                </div>
                <div>
                  <p className="eyebrow">Featured piece</p>
                  <strong>midnight</strong>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>

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
                {latestRelease.tracks.map((track, index) => (
                  <li key={track}>
                    <span>{`0${index + 1}`}</span>
                    <strong>{track}</strong>
                  </li>
                ))}
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
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                ></iframe>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="pieces">
        <div className="container">
          <div className="section-heading" data-reveal>
            <p className="eyebrow">Featured</p>
            <h2>Pieces</h2>
          </div>
          <div className="piece-grid">
            {featuredSongOrder.map((slug) => {
              const song = songs[slug];
              return (
                <article className="piece-card" key={song.slug} data-reveal>
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
              );
            })}
          </div>
          <div className="section-heading section-heading--sub" data-reveal>
            <p className="eyebrow">Catalog</p>
            <h2>All music</h2>
          </div>
          <div className="catalog-grid">
            {catalogSongs.map((song) => (
              <article className="catalog-card" key={song.slug} data-reveal>
                <Link className="card-link-overlay" href={`/${song.slug}`} aria-label={`Open ${song.title}`} />
                <div className="catalog-card__top">
                  <div className="catalog-card__thumb">
                    <Image
                      className="cover-image"
                      src={song.art}
                      alt={`${song.title} cover art`}
                      width={160}
                      height={160}
                      sizes="80px"
                    />
                  </div>
                  <div>
                    <p className="eyebrow">{song.releaseDate}</p>
                    <h3>{song.title}</h3>
                    <p>{song.subtitle}</p>
                  </div>
                </div>
                <div className="catalog-card__actions">
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
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="about">
        <div className="container about__grid">
          <div className="about-copy" data-reveal>
            <p className="eyebrow">About</p>
            <h2>Calle Wallerstedt</h2>
            <p>Sweden</p>
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

      <section className="section" id="playlists">
        <div className="container">
          <div className="section-heading" data-reveal>
            <p className="eyebrow">Playlists</p>
            <h2>Listen while studying or relaxing.</h2>
          </div>
          <div className="playlist-grid">
            {playlists.map((playlist) => (
              <article className="playlist-card" key={playlist.title} data-reveal>
                <h3>{playlist.title}</h3>
                <a className="button button--ghost playlist-card__button" href={playlist.href} target="_blank" rel="noreferrer">
                  {playlist.label}
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="follow">
        <div className="container social-grid">
          <div className="section-heading" data-reveal>
            <p className="eyebrow">Follow for new music</p>
            <h2>Stay close to the next release.</h2>
          </div>
          <SocialIconRow links={socialLinks} />
        </div>
      </section>
    </main>
  );
}
