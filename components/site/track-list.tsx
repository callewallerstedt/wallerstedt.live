"use client";

import Link from "next/link";
import type { Route } from "next";

import { PlatformIcon } from "@/components/icons";
import { NowPlayingBars, PlayButton, usePlayer } from "@/components/site/player";
import { formatDuration, type PlayableTrack } from "@/lib/site/types";

function TrackRow({
  track,
  index,
  queue,
  showRelease,
}: {
  track: PlayableTrack;
  index: number;
  queue: string[];
  showRelease?: boolean;
}) {
  const { isActive } = usePlayer();

  return (
    <li className={`wl-track${isActive(track.slug) ? " is-current" : ""}`}>
      <span className="wl-track__no">{String(index + 1).padStart(2, "0")}</span>

      <div className="wl-track__main">
        <PlayButton slug={track.slug} queue={queue} label={track.title} />
        <div className="wl-track__name">
          <Link href={`/${track.slug}` as Route}>{track.shortTitle}</Link>
          <span className="wl-track__sub">
            {[track.variant, showRelease ? track.releaseTitle : null].filter(Boolean).join(" · ") ||
              track.year}
          </span>
        </div>
      </div>

      <div className="wl-track__end">
        <NowPlayingBars slug={track.slug} />
        <span className="wl-track__time">{formatDuration(track.durationMs)}</span>
        <div className="wl-track__links">
          {track.platforms.spotify ? (
            <a
              className="wl-icon-link"
              href={track.platforms.spotify}
              target="_blank"
              rel="noreferrer"
              aria-label={`${track.title} on Spotify`}
            >
              <PlatformIcon platform="spotify" />
            </a>
          ) : null}
          {track.platforms.appleMusic ? (
            <a
              className="wl-icon-link"
              href={track.platforms.appleMusic}
              target="_blank"
              rel="noreferrer"
              aria-label={`${track.title} on Apple Music`}
            >
              <PlatformIcon platform="appleMusic" />
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function TrackList({
  tracks,
  queue,
  showRelease = false,
}: {
  tracks: PlayableTrack[];
  queue?: string[];
  showRelease?: boolean;
}) {
  const order = queue ?? tracks.map((track) => track.slug);

  return (
    <ul className="wl-tracks">
      {tracks.map((track, index) => (
        <TrackRow
          key={track.slug}
          track={track}
          index={index}
          queue={order}
          showRelease={showRelease}
        />
      ))}
    </ul>
  );
}
