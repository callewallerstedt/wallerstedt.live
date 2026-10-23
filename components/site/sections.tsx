import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { PlatformIcon, platformLabel } from "@/components/icons";
import { ArrowIcon } from "@/components/site/icons";
import { PlaylistGrid } from "@/components/site/playlist-grid";
import { ReleaseGrid } from "@/components/site/release-grid";
import { UpdatesForm } from "@/components/site/updates-form";
import { TrackList } from "@/components/site/track-list";
import { artist } from "@/lib/artist";
import type { SitePlaylist } from "@/lib/site/playlists";
import type { PlayableTrack, SiteRelease } from "@/lib/site/types";

const platformOrder = ["spotify", "appleMusic", "youtube"] as const;

function spotifyEmbed(url: string | undefined, kind: "album" | "track" | "playlist") {
  if (!url) return null;
  const id = url.match(new RegExp(`open\\.spotify\\.com/${kind}/([A-Za-z0-9]+)`))?.[1];
  return id ? `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0` : null;
}

export function SectionHead({ title, action }: { title: string; action?: { href: string; label: string } }) {
  return (
    <div className="wl-section-head">
      <h2 className="wl-h2" data-reveal="0">
        {title}
      </h2>
      {action ? (
        <Link className="wl-link" href={action.href as Route} data-reveal="1">
          {action.label}
          <ArrowIcon />
        </Link>
      ) : null}
    </div>
  );
}

export function PageHead({ title, center = false, children }: { title: string; center?: boolean; children?: ReactNode }) {
  return (
    <section className={`wl-head${center ? " wl-head--center" : ""}`}>
      <div className="wl-shell">
        <h1 className="wl-display wl-intro" style={{ ["--i" as string]: 0 }}>
          {title}
        </h1>
        {children ? (
          <div className="wl-intro" style={{ ["--i" as string]: 2 }}>
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function Popular({ tracks, queue }: { tracks: PlayableTrack[]; queue: string[] }) {
  if (!tracks.length) return null;

  return (
    <section className="wl-section" id="popular">
      <div className="wl-shell wl-narrow">
        <SectionHead title="Popular" />
        <TrackList tracks={tracks} queue={queue} showArt />
      </div>
    </section>
  );
}

export function Releases({
  releases,
  title = "Music",
  action,
}: {
  releases: SiteRelease[];
  title?: string;
  action?: { href: string; label: string };
}) {
  return (
    <section className="wl-section" id="music">
      <div className="wl-shell">
        <SectionHead title={title} action={action} />
        <ReleaseGrid releases={releases} />
      </div>
    </section>
  );
}

export function SignupBand({ art }: { art: string }) {
  return (
    <section className="wl-section" id="signup">
      <div className="wl-shell">
        <div className="wl-band" data-reveal="0">
          <div className="wl-band__art" aria-hidden="true">
            <Image src={art} alt="" width={240} height={240} sizes="50vw" />
          </div>
          <div className="wl-band__copy">
            <h2 className="wl-h2">Get new songs first</h2>
          </div>
          <UpdatesForm source="home" />
        </div>
      </div>
    </section>
  );
}

export function About() {
  return (
    <section className="wl-section" id="about">
      <div className="wl-shell wl-about">
        <figure className="wl-about__photo" data-reveal="0">
          <Image
            src={artist.profileImage}
            alt="Wallerstedt at the piano"
            width={640}
            height={640}
            sizes="(max-width: 900px) 92vw, 40vw"
          />
        </figure>
        <div className="wl-about__copy">
          <h2 className="wl-h2" data-reveal="1">
            Hi, I&rsquo;m Wallerstedt
          </h2>
          <p data-reveal="2">
            I&rsquo;m a self-taught pianist from Sweden. Never had a lesson, can&rsquo;t really read
            sheet music. I just play until it sounds right.
          </p>
          <p data-reveal="3">
            Most of it is slow, calm piano for late nights, studying, or just winding down.
          </p>
          <a className="wl-link" href={`mailto:${artist.contact}`} data-reveal="4">
            {artist.contact}
            <ArrowIcon />
          </a>
        </div>
      </div>
    </section>
  );
}

export function Playlists({
  playlists,
  title,
  action,
}: {
  playlists: SitePlaylist[];
  title?: string;
  action?: { href: string; label: string };
}) {
  if (!playlists.length) return null;

  return (
    <section className={title ? "wl-section" : "wl-section wl-section--flush"} id="playlists">
      <div className="wl-shell">
        {title ? <SectionHead title={title} action={action} /> : null}
        <PlaylistGrid playlists={playlists} />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function PlatformGrid({
  platforms,
  more,
}: {
  platforms: Record<string, string | undefined>;
  more?: string;
}) {
  const available = platformOrder.filter((key) => platforms[key]);
  if (!available.length && !more) {
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
      {more ? (
        <a className="wl-platform" href={more} target="_blank" rel="noreferrer">
          <span>More</span>
          <ArrowIcon />
        </a>
      ) : null}
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
