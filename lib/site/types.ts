import type { PlatformLinks } from "@/lib/site-data";

/**
 * Shapes and formatters shared by server and client components. Kept free of
 * any Node imports so client bundles never drag `node:fs` along with them.
 */

/** Fallback accent — the warm candle tone the site falls back to before any artwork is in play. */
export const DEFAULT_ACCENT = "212 165 108";

export type ReleaseFormat = "EP" | "Single" | "Version";

export interface PlayableTrack {
  slug: string;
  title: string;
  /** Title with the " - slowed + reverb" style suffix split off, for tighter layouts. */
  shortTitle: string;
  variant: string | null;
  releaseTitle: string;
  releaseSlug: string;
  releaseHref: string;
  art: string;
  accent: string;
  preview: string | null;
  durationMs: number | null;
  releaseDate: string;
  year: string;
  note: string;
  platforms: PlatformLinks;
  allPlatforms: string;
  embed: string;
}

export interface SiteRelease {
  slug: string;
  title: string;
  format: ReleaseFormat;
  releaseDate: string;
  year: string;
  timestamp: number;
  upcoming: boolean;
  art: string;
  accent: string;
  href: string;
  platforms: PlatformLinks;
  allPlatforms: string;
  tracks: PlayableTrack[];
  runtimeMs: number;
}

export interface SiteCatalog {
  releases: SiteRelease[];
  tracks: PlayableTrack[];
  /** Newest release that isn't a slowed/sped variant — what the site leads with. */
  latest: SiteRelease | null;
  /** Newest release of any kind, variants included. */
  newest: SiteRelease | null;
  stats: {
    releases: number;
    tracks: number;
    eps: number;
    singles: number;
    firstYear: string;
    latestYear: string;
  };
}

export function formatDuration(ms: number | null | undefined) {
  if (!ms) {
    return "—";
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatRuntime(ms: number) {
  if (!ms) {
    return "";
  }
  return `${Math.round(ms / 60000)} min`;
}
