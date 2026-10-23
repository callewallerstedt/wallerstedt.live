"use client";

import Image from "next/image";
import { useState } from "react";

import { PlatformIcon } from "@/components/icons";
import { accentVars } from "@/components/site/accent";
import { PlayIcon } from "@/components/site/icons";
import type { SitePlaylist } from "@/lib/site/playlists";

/** A cover that flips into the Spotify player in place when you press play. */
function PlaylistTile({ playlist, index }: { playlist: SitePlaylist; index: number }) {
  const [playing, setPlaying] = useState(false);

  return (
    <article className={`wl-pl${playing ? " is-playing" : ""}`} style={accentVars(playlist.accent)} data-reveal={index}>
      <div className="wl-pl__media">
        {playing ? (
          <iframe
            src={`https://open.spotify.com/embed/playlist/${playlist.id}?utm_source=generator&theme=0`}
            title={playlist.title}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          />
        ) : (
          <button type="button" className="wl-pl__cover" onClick={() => setPlaying(true)} aria-label={`Play ${playlist.title}`}>
            {playlist.cover ? (
              <Image
                src={playlist.cover}
                alt=""
                width={640}
                height={640}
                sizes="(max-width: 640px) 92vw, (max-width: 1100px) 46vw, 30vw"
              />
            ) : null}
            <span className="wl-pl__play">
              <PlayIcon />
            </span>
          </button>
        )}
      </div>

      <div className="wl-pl__body">
        <div className="wl-pl__text">
          <h3>{playlist.title}</h3>
          {playlist.songs ? <span>{playlist.songs} songs</span> : null}
        </div>
        <a className="wl-pl__save" href={playlist.href} target="_blank" rel="noreferrer">
          <PlatformIcon platform="spotify" />
          <span>Save</span>
        </a>
      </div>
    </article>
  );
}

export function PlaylistGrid({ playlists }: { playlists: SitePlaylist[] }) {
  return (
    <div className={`wl-pls wl-pls--${Math.min(playlists.length, 3)}`}>
      {playlists.map((playlist, index) => (
        <PlaylistTile key={playlist.id} playlist={playlist} index={index} />
      ))}
    </div>
  );
}
