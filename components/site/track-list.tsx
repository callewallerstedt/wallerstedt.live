"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import { NowPlayingBars, PlayButton, usePlayer } from "@/components/site/player";
import { formatDuration, type PlayableTrack } from "@/lib/site/types";

function TrackRow({
  track,
  index,
  queue,
  showArt,
}: {
  track: PlayableTrack;
  index: number;
  queue: string[];
  showArt?: boolean;
}) {
  const { isActive } = usePlayer();

  return (
    <li className={`wl-track${isActive(track.slug) ? " is-current" : ""}`} data-reveal={index}>
      <span className="wl-track__no">{index + 1}</span>
      {showArt ? (
        <span className="wl-track__art">
          <Image src={track.art} alt="" width={96} height={96} sizes="48px" />
        </span>
      ) : null}
      <PlayButton slug={track.slug} queue={queue} label={track.title} />
      <div className="wl-track__name">
        <Link href={`/${track.slug}` as Route}>{track.shortTitle}</Link>
        {track.variant ? <span>{track.variant}</span> : null}
      </div>
      <NowPlayingBars slug={track.slug} />
      <span className="wl-track__time">{formatDuration(track.durationMs)}</span>
    </li>
  );
}

export function TrackList({
  tracks,
  queue,
  showArt = false,
}: {
  tracks: PlayableTrack[];
  queue?: string[];
  showArt?: boolean;
}) {
  const order = queue ?? tracks.map((track) => track.slug);

  return (
    <ol className="wl-tracks">
      {tracks.map((track, index) => (
        <TrackRow key={track.slug} track={track} index={index} queue={order} showArt={showArt} />
      ))}
    </ol>
  );
}
