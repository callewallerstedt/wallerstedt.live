import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import { PlatformIcon, platformLabel } from "@/components/icons";
import { accentVars } from "@/components/site/accent";
import { ArrowIcon } from "@/components/site/icons";
import { PlayButton } from "@/components/site/player";
import { ReleaseIndex } from "@/components/site/release-index";
import { TrackList } from "@/components/site/track-list";
import { artist } from "@/lib/artist";
import type { PlaylistCard } from "@/lib/site-data";
import { formatRuntime, type PlayableTrack, type SiteRelease } from "@/lib/site/types";

const platformOrder = ["spotify", "appleMusic", "amazonMusic", "deezer", "tidal", "soundcloud"] as const;

function spotifyEmbed(url: string | undefined, kind: "album" | "track" | "playlist") {
  if (!url) return null;
  const id = url.match(new RegExp(`open\\.spotify\\.com/${kind}/([A-Za-z0-9]+)`))?.[1];
  return id ? `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0` : null;
}

/* -------------------------------------------------------------------------- */

export function LatestRelease({ release }: { release: SiteRelease }) {
  const queue = release.tracks.map((track) => track.slug);
  const blurb =
    release.tracks.find((track) => track.note)?.note ??
    `${release.tracks.length} ${release.tracks.length === 1 ? "piece" : "pieces"} of piano, recorded in Sweden.`;

  return (
    <section className="wl-section" id="latest" style={accentVars(release.accent)}>
      <div className="wl-shell">
        <div className="wl-latest">
          <div data-wl-reveal="0">
            <div className="wl-cover">
              <Image
                src={release.art}
                alt={`${release.title} cover art`}
                width={1000}
                height={1000}
                priority
                sizes="(max-width: 900px) 92vw, 40vw"
              />
            </div>
          </div>

          <div className="wl-latest__body">
            <p className="wl-eyebrow" data-wl-reveal="0">
              {release.upcoming ? "Next release" : "Latest release"}
            </p>
            <h2 className="wl-display wl-latest__title" data-wl-reveal="1">
              {release.title}
            </h2>
            <p className="wl-lede" data-wl-reveal="2">
              {blurb}
            </p>

            <dl className="wl-facts" data-wl-reveal="2">
              <div>
                <dt>{release.upcoming ? "Releases" : "Released"}</dt>
                <dd>{release.releaseDate}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{release.format}</dd>
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

            <div className="wl-btn-row" data-wl-reveal="3">
              {release.platforms.spotify ? (
                <a
                  className="wl-btn wl-btn--solid"
                  href={release.platforms.spotify}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="wl-btn__icon">
                    <PlatformIcon platform="spotify" />
                  </span>
                  <span>Open on Spotify</span>
                </a>
              ) : null}
              <a className="wl-btn" href={release.allPlatforms} target="_blank" rel="noreferrer">
                <span>Every platform</span>
              </a>
              {release.tracks.length > 1 ? (
                <Link className="wl-btn wl-btn--ghost" href={`/music/${release.slug}` as Route}>
                  <span>Release page</span>
                </Link>
              ) : null}
            </div>

            <div data-wl-reveal="4">
              <TrackList tracks={release.tracks} queue={queue} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function SelectedWork({
  tracks,
  queue,
  eyebrow = "Selected",
  title = "Start here.",
  action,
}: {
  tracks: PlayableTrack[];
  queue: string[];
  eyebrow?: string;
  title?: string;
  action?: { href: string; label: string };
}) {
  if (!tracks.length) {
    return null;
  }

  return (
    <section className="wl-section wl-section--tight" id="selected">
      <div className="wl-shell">
        <div className="wl-section-head">
          <div className="wl-section-head__copy">
            <p className="wl-eyebrow" data-wl-reveal="0">
              {eyebrow}
            </p>
            <h2 className="wl-h2" data-wl-reveal="1">
              {title}
            </h2>
          </div>
          {action ? (
            <Link className="wl-link" href={action.href as Route} data-wl-reveal="1">
              {action.label}
              <ArrowIcon />
            </Link>
          ) : null}
        </div>

        <div className="wl-cards">
          {tracks.map((track, index) => (
            <article
              className="wl-card"
              key={track.slug}
              style={accentVars(track.accent)}
              data-wl-reveal={index}
            >
              <div className="wl-card__media">
                <Image
                  src={track.art}
                  alt={`${track.title} cover art`}
                  width={720}
                  height={720}
                  sizes="(max-width: 640px) 92vw, (max-width: 1100px) 46vw, 24vw"
                />
                <span className="wl-card__veil" aria-hidden="true" />
                <PlayButton
                  slug={track.slug}
                  queue={queue}
                  label={track.title}
                  className="wl-card__play"
                />
              </div>
              <Link
                className="wl-card__link"
                href={`/${track.slug}` as Route}
                aria-label={`Open ${track.title}`}
              />
              <div className="wl-card__body">
                <h3>{track.shortTitle}</h3>
                <span className="wl-card__index">{track.year}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function Chapter({
  stats,
}: {
  stats: Array<{ value: string; label: string }>;
}) {
  return (
    <section className="wl-chapter" id="about">
      <div className="wl-shell wl-chapter__grid">
        <div className="wl-chapter__copy">
          <p className="wl-eyebrow" data-wl-reveal="0">
            About
          </p>
          <p className="wl-chapter__statement" data-wl-reveal="1">
            I never took a piano lesson and I still can&rsquo;t read sheet music. I just kept
            playing until it sounded like <em>something I wanted to hear</em>.
          </p>
          <div className="wl-chapter__prose" data-wl-reveal="2">
            <p>
              It started on an old Casio keyboard when I was eight, because a kid in my class could
              play a song and I wanted to as well. I practised for hours and it sounded terrible.
              Then one week it didn&rsquo;t, and I have played almost every day since.
            </p>
            <p>
              Now I write neo-classical piano — slow, cinematic pieces for late evenings, long
              trains, focus, and rooms with nobody else in them. Everything here is written and
              recorded in Sweden, usually at night, usually in one take more than it should have
              been.
            </p>
          </div>
          <div className="wl-btn-row" data-wl-reveal="3">
            <Link className="wl-btn" href="/music">
              <span>Hear everything</span>
            </Link>
            <a className="wl-btn wl-btn--ghost" href={`mailto:${artist.contact}`}>
              <span>Get in touch</span>
            </a>
          </div>
          <div className="wl-chapter__stats" data-wl-reveal="4">
            {stats.map((stat) => (
              <div className="wl-stat" key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <figure className="wl-chapter__portrait" data-wl-reveal="2">
          <Image
            src="/media/artist-about.jpg"
            alt="Wallerstedt at the piano"
            width={900}
            height={1125}
            sizes="(max-width: 900px) 92vw, 38vw"
          />
        </figure>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function Discography({
  releases,
  eyebrow = "Discography",
  title = "Everything, in order.",
}: {
  releases: SiteRelease[];
  eyebrow?: string;
  title?: string;
}) {
  return (
    <section className="wl-section" id="discography">
      <div className="wl-shell">
        <div className="wl-section-head">
          <div className="wl-section-head__copy">
            <p className="wl-eyebrow" data-wl-reveal="0">
              {eyebrow}
            </p>
            <h2 className="wl-h2" data-wl-reveal="1">
              {title}
            </h2>
          </div>
          <p className="wl-meta" data-wl-reveal="1">
            {releases.length} releases · {releases.reduce((sum, r) => sum + r.tracks.length, 0)} tracks
          </p>
        </div>
        <ReleaseIndex releases={releases} />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function Playlists({ playlists }: { playlists: PlaylistCard[] }) {
  return (
    <section className="wl-section" id="playlists">
      <div className="wl-shell">
        <div className="wl-section-head">
          <div className="wl-section-head__copy">
            <p className="wl-eyebrow" data-wl-reveal="0">
              Playlists
            </p>
            <h2 className="wl-h2" data-wl-reveal="1">
              Long listens.
            </h2>
          </div>
        </div>

        <div className="wl-playlists">
          {playlists.map((playlist, index) => {
            const embed = spotifyEmbed(playlist.href, "playlist");

            return (
              <article className="wl-playlist" key={playlist.title} data-wl-reveal={index}>
                {embed ? (
                  <div className="wl-playlist__embed">
                    <iframe
                      src={embed}
                      title={playlist.title}
                      loading="lazy"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    />
                  </div>
                ) : null}
                <div>
                  <h3 className="wl-h3">{playlist.title}</h3>
                  <p>{playlist.description}</p>
                </div>
                <a className="wl-link" href={playlist.href} target="_blank" rel="noreferrer">
                  {playlist.label}
                  <ArrowIcon />
                </a>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function PlatformGrid({ platforms }: { platforms: Record<string, string | undefined> }) {
  const available = platformOrder.filter((key) => platforms[key]);
  if (!available.length) {
    return null;
  }

  return (
    <div className="wl-platforms">
      {available.map((key) => (
        <a className="wl-platform" key={key} href={platforms[key]} target="_blank" rel="noreferrer">
          <PlatformIcon platform={key} />
          <span>{platformLabel[key]}</span>
        </a>
      ))}
    </div>
  );
}

export function SpotifyEmbed({
  url,
  kind,
  tall = false,
}: {
  url?: string;
  kind: "album" | "track";
  tall?: boolean;
}) {
  const src = spotifyEmbed(url, kind);
  if (!src) {
    return null;
  }

  return (
    <div className={`wl-embed${tall ? " wl-embed--tall" : ""}`}>
      <iframe
        src={src}
        title="Spotify player"
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      />
    </div>
  );
}
