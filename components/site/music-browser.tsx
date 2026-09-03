"use client";

import { useMemo, useState } from "react";

import { ReleaseIndex } from "@/components/site/release-index";
import { TrackList } from "@/components/site/track-list";
import type { SiteRelease } from "@/lib/site/types";

type Filter = "all" | "EP" | "Single" | "Version";

const filters: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "Everything" },
  { key: "EP", label: "EPs" },
  { key: "Single", label: "Singles" },
  { key: "Version", label: "Slowed + sped" },
];

export function MusicBrowser({ releases }: { releases: SiteRelease[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"releases" | "tracks">("releases");

  const counts = useMemo(() => {
    const map: Record<Filter, number> = { all: releases.length, EP: 0, Single: 0, Version: 0 };
    releases.forEach((release) => {
      map[release.format] += 1;
    });
    return map;
  }, [releases]);

  const visible = useMemo(
    () => (filter === "all" ? releases : releases.filter((release) => release.format === filter)),
    [filter, releases],
  );

  const tracks = useMemo(() => visible.flatMap((release) => release.tracks), [visible]);
  const queue = useMemo(() => tracks.filter((track) => track.preview).map((track) => track.slug), [tracks]);

  return (
    <>
      <div className="wl-shell">
        <div className="wl-toolbar">
          <div className="wl-filters" role="group" aria-label="Filter releases">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`wl-filter${filter === item.key ? " is-on" : ""}`}
                aria-pressed={filter === item.key}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
                <span>{counts[item.key]}</span>
              </button>
            ))}
          </div>

          <div className="wl-filters" role="group" aria-label="Change view">
            <button
              type="button"
              className={`wl-filter${view === "releases" ? " is-on" : ""}`}
              aria-pressed={view === "releases"}
              onClick={() => setView("releases")}
            >
              Releases
            </button>
            <button
              type="button"
              className={`wl-filter${view === "tracks" ? " is-on" : ""}`}
              aria-pressed={view === "tracks"}
              onClick={() => setView("tracks")}
            >
              Tracks
            </button>
          </div>
        </div>
      </div>

      <section className="wl-section wl-section--tight">
        <div className="wl-shell">
          {visible.length === 0 ? (
            <p className="wl-empty">Nothing here yet.</p>
          ) : view === "releases" ? (
            <ReleaseIndex releases={visible} />
          ) : (
            <TrackList tracks={tracks} queue={queue} showRelease />
          )}
        </div>
      </section>
    </>
  );
}
