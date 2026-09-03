import catalogExtra from "@/lib/catalog-extra.json";
import { getCatalogReleases, getCatalogSongs, type Release, type Song } from "@/lib/site-data";
import {
  DEFAULT_ACCENT,
  type PlayableTrack,
  type ReleaseFormat,
  type SiteCatalog,
  type SiteRelease,
} from "@/lib/site/types";

export * from "@/lib/site/types";

type ExtraEntry = {
  preview: string | null;
  durationMs: number | null;
  rgb: [number, number, number] | null;
};

const extra = catalogExtra as unknown as Record<string, ExtraEntry | undefined>;


/**
 * Artwork colours come out of Spotify's palette extraction, which favours dark, muddy
 * tones. Lift them into a range that still reads as the cover but survives being used
 * for type and hairlines on a near-black page.
 */
function toAccent(rgb: [number, number, number] | null | undefined) {
  if (!rgb) {
    return DEFAULT_ACCENT;
  }

  const [r, g, b] = rgb.map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  hue *= 60;
  if (hue < 0) hue += 360;

  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  const nextSaturation = Math.min(0.82, Math.max(0.44, saturation * 1.35));
  const nextLightness = Math.min(0.76, Math.max(0.62, lightness * 1.55));

  const c = (1 - Math.abs(2 * nextLightness - 1)) * nextSaturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = nextLightness - c / 2;
  const segment = Math.floor(hue / 60) % 6;
  const table: Array<[number, number, number]> = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [rr, gg, bb] = table[segment];

  return [rr + m, gg + m, bb + m].map((value) => Math.round(value * 255)).join(" ");
}

function splitTitle(title: string) {
  const match = title.match(/^(.*?)\s+-\s+(slowed \+ reverb|sped up|piano version|instrumental)$/i);
  if (!match) {
    return { shortTitle: title, variant: null as string | null };
  }
  return { shortTitle: match[1], variant: match[2].toLowerCase() };
}

function getFormat(subtitle: string, title: string): ReleaseFormat {
  if (/\((slowed \+ reverb|sped up)\)/i.test(title)) {
    return "Version";
  }
  return /\bEP$/i.test(subtitle.trim()) ? "EP" : "Single";
}

function toTrack(song: Song, release: Release, accent: string): PlayableTrack {
  const entry = extra[song.slug];
  const timestamp = new Date(song.releaseDate).getTime();
  const { shortTitle, variant } = splitTitle(song.title);

  return {
    slug: song.slug,
    title: song.title,
    shortTitle,
    variant,
    releaseTitle: release.title,
    releaseSlug: release.slug,
    releaseHref: release.tracks.length > 1 ? `/music/${release.slug}` : `/${song.slug}`,
    art: song.art,
    accent,
    preview: entry?.preview ?? null,
    durationMs: entry?.durationMs ?? null,
    releaseDate: song.releaseDate,
    year: Number.isNaN(timestamp) ? "" : String(new Date(song.releaseDate).getUTCFullYear()),
    note: song.note ?? "",
    platforms: song.platforms,
    allPlatforms: song.allPlatforms,
    embed: song.embed,
  };
}

function isUpcoming(release: Release) {
  const hasLiveLink = Boolean(
    release.platforms.spotify ||
      release.platforms.appleMusic ||
      release.platforms.amazonMusic ||
      release.platforms.deezer ||
      release.platforms.tidal,
  );
  if (hasLiveLink) {
    return false;
  }
  const timestamp = new Date(release.releaseDate).getTime();
  return !Number.isNaN(timestamp) && timestamp > Date.now();
}

/**
 * The release cover is the strongest colour source we have, so every track inside a
 * release shares the release accent rather than flickering between per-track palettes.
 */
function releaseAccent(release: Release) {
  for (const track of release.tracks) {
    const rgb = extra[track.slug]?.rgb;
    if (rgb) {
      return toAccent(rgb);
    }
  }
  return DEFAULT_ACCENT;
}

export async function getSiteCatalog(): Promise<SiteCatalog> {
  const [releases, songs] = await Promise.all([getCatalogReleases(), getCatalogSongs()]);
  const durations = new Map(songs.map((song) => [song.slug, extra[song.slug]?.durationMs ?? 0]));

  const siteReleases: SiteRelease[] = releases
    .map((release) => {
      const accent = releaseAccent(release);
      const timestamp = new Date(release.releaseDate).getTime();
      const tracks = release.tracks.map((song) => toTrack(song, release, accent));

      return {
        slug: release.slug,
        title: release.title,
        format: getFormat(release.subtitle, release.title),
        releaseDate: release.releaseDate,
        year: Number.isNaN(timestamp) ? "" : String(new Date(release.releaseDate).getUTCFullYear()),
        timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
        upcoming: isUpcoming(release),
        art: release.art,
        accent,
        href: tracks.length > 1 ? `/music/${release.slug}` : `/${release.tracks[0].slug}`,
        platforms: release.platforms,
        allPlatforms: release.allPlatforms,
        tracks,
        runtimeMs: release.tracks.reduce((total, song) => total + (durations.get(song.slug) ?? 0), 0),
      } satisfies SiteRelease;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  const tracks = siteReleases.flatMap((release) => release.tracks);
  // Slowed/sped versions stay in the index but never take the headline slot.
  const original = siteReleases.filter((release) => release.format !== "Version");
  const years = siteReleases.map((release) => release.year).filter(Boolean).sort();

  return {
    releases: siteReleases,
    tracks,
    latest: original[0] ?? siteReleases[0] ?? null,
    newest: siteReleases[0] ?? null,
    stats: {
      releases: siteReleases.length,
      tracks: tracks.length,
      eps: siteReleases.filter((release) => release.format === "EP").length,
      singles: siteReleases.filter((release) => release.format === "Single").length,
      firstYear: years[0] ?? "",
      latestYear: years[years.length - 1] ?? "",
    },
  };
}

export function getReleaseBySlugFrom(catalog: SiteCatalog, slug: string) {
  return catalog.releases.find((release) => release.slug === slug) ?? null;
}

export function getTrackBySlugFrom(catalog: SiteCatalog, slug: string) {
  return catalog.tracks.find((track) => track.slug === slug) ?? null;
}

