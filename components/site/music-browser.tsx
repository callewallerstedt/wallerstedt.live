"use client";

import { useMemo, useState } from "react";

import { ReleaseGrid } from "@/components/site/release-grid";
import type { SiteRelease } from "@/lib/site/types";

type Filter = "all" | "EP" | "Single" | "Version";

const filters: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "EP", label: "EPs" },
  { key: "Single", label: "Singles" },
  { key: "Version", label: "Slowed + sped up" },
];

export function MusicBrowser({ releases }: { releases: SiteRelease[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const available = useMemo(
    () => filters.filter((item) => item.key === "all" || releases.some((release) => release.format === item.key)),
    [releases],
  );

  const visible = useMemo(
    () => (filter === "all" ? releases : releases.filter((release) => release.format === filter)),
    [filter, releases],
  );

  return (
    <section className="wl-section wl-section--flush">
      <div className="wl-shell">
        <div className="wl-filters wl-intro" role="group" aria-label="Filter releases" style={{ ["--i" as string]: 3 }}>
          {available.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`wl-filter${filter === item.key ? " is-on" : ""}`}
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <ReleaseGrid key={filter} releases={visible} />
      </div>
    </section>
  );
}
