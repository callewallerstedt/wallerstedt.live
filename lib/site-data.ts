import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { unstable_noStore as noStore } from "next/cache";

import { artist } from "./artist";
import songCatalog from "./song-catalog.json";

export { artist } from "./artist";

export type PlatformKey =
  | "spotify"
  | "appleMusic"
  | "youtube"
  | "amazonMusic"
  | "deezer"
  | "tiktok"
  | "instagram"
  | "patreon"
  | "soundcloud"
  | "tidal";

export type SongSlug = string;

export type PlatformLinks = Partial<Record<PlatformKey, string>>;

export interface Song {
  slug: SongSlug;
  spotifyId: string;
  title: string;
  subtitle: string;
  releaseDate: string;
  art: string;
  blurb: string;
  note: string;
  embed: string;
  allPlatforms: string;
  platforms: PlatformLinks;
  releaseArt?: string;
  releaseAllPlatforms?: string;
  releasePlatforms?: PlatformLinks;
}

export interface PlaylistCard {
  title: string;
  description: string;
  href: string;
  label: string;
}

export interface SocialLink {
  key: PlatformKey;
  label: string;
  href: string;
}

export interface ListenerCity {
  city: string;
  countryCode: string;
  listeners: string;
}

export interface Release {
  key: string;
  slug: SongSlug;
  title: string;
  subtitle: string;
  releaseDate: string;
  art: string;
  allPlatforms: string;
  platforms: PlatformLinks;
  tracks: Song[];
}

const releaseOverrides: Record<string, Partial<Pick<Release, "art" | "allPlatforms" | "platforms">>> = {
  "after-dark": {
    art: "/media/after-dark.jpg",
    allPlatforms: "https://album.link/us/i/1815563776",
    platforms: {
      spotify: "https://open.spotify.com/album/0AV6mX1ZhHoeooni3auEWn",
      appleMusic: "https://geo.music.apple.com/se/album/_/1815563776?mt=1&app=music&ls=1&at=1000lHKX&ct=api_http&itscg=30200&itsct=odsl_m",
      amazonMusic: "https://music.amazon.com/albums/B0F99VQ47Y",
      deezer: "https://www.deezer.com/album/757555161",
      soundcloud: "https://soundcloud.com/wallerstedt/sets/after-dark-288672401?utm_medium=api&utm_campaign=social_sharing&utm_source=id_314547",
      tidal: "https://listen.tidal.com/album/437026201",
    },
  },
  coalescence: {
    art: "/media/songs/coalescence.jpg",
    allPlatforms: "https://album.link/us/i/1736632575",
    platforms: {
      spotify: "https://open.spotify.com/album/4zLiTwHcVNuwovOKw9JJ0M",
      appleMusic: "https://geo.music.apple.com/se/album/_/1736632575?mt=1&app=music&ls=1&at=1000lHKX&ct=api_http&itscg=30200&itsct=odsl_m",
      amazonMusic: "https://music.amazon.com/albums/B0CYF1JB8H",
      deezer: "https://www.deezer.com/album/562004642",
      tidal: "https://listen.tidal.com/album/352823311",
    },
  },
  september: {
    allPlatforms: "https://album.link/us/i/1709267196",
    platforms: {
      spotify: "https://open.spotify.com/album/4yRSc0MwIO38LEWhHI4yp1",
      appleMusic: "https://geo.music.apple.com/se/album/_/1709267196?mt=1&app=music&ls=1&at=1000lHKX&ct=api_http&itscg=30200&itsct=odsl_m",
      amazonMusic: "https://music.amazon.com/albums/B0CJXSLVY6",
      deezer: "https://www.deezer.com/album/494759821",
      tidal: "https://listen.tidal.com/album/318617661",
    },
  },
  memories: {
    allPlatforms: "https://album.link/us/i/1790497475",
    platforms: {
      spotify: "https://open.spotify.com/album/11rkx3sdTx0PMNkZOY25W9",
      appleMusic: "https://geo.music.apple.com/se/album/_/1790497475?mt=1&app=music&ls=1&at=1000lHKX&ct=api_http&itscg=30200&itsct=odsl_m",
      amazonMusic: "https://music.amazon.com/albums/B0CDQFQLMN",
      deezer: "https://www.deezer.com/album/472542685",
      tidal: "https://listen.tidal.com/album/411592452",
    },
  },
};

const songCatalogPath = path.join(process.cwd(), "data", "song-catalog.json");

export const latestRelease = {
  title: "after dark - EP",
  displayTitle: "after dark",
  releaseDate: "July 4, 2025",
  art: "/media/after-dark.jpg",
  embed: "https://open.spotify.com/embed/album/0AV6mX1ZhHoeooni3auEWn?utm_source=generator&theme=0",
  allPlatforms: "https://album.link/s/0AV6mX1ZhHoeooni3auEWn",
  platforms: {
    spotify: "https://open.spotify.com/album/0AV6mX1ZhHoeooni3auEWn",
    appleMusic: "https://music.apple.com/us/album/after-dark-ep/1815563776?uo=4",
    amazonMusic: "https://music.amazon.com/albums/B0F99VQ47Y",
    deezer: "https://www.deezer.com/album/757555161",
    soundcloud:
      "https://soundcloud.com/wallerstedt/sets/after-dark-288672401?utm_medium=api&utm_campaign=social_sharing&utm_source=id_314547",
  } satisfies PlatformLinks,
  tracks: ["dusk", "moonlight", "midnight", "twilight", "dawn"],
} as const;

export const catalogSongs: Song[] = songCatalog as Song[];

export const songs = Object.fromEntries(catalogSongs.map((song) => [song.slug, song])) as Record<string, Song>;

function getReleaseKey(song: Song) {
  const appleMusicLink = song.releasePlatforms?.appleMusic ?? song.platforms.appleMusic ?? "";
  const spotifyLink = song.releasePlatforms?.spotify ?? song.platforms.spotify ?? "";
  const amazonLink = song.releasePlatforms?.amazonMusic ?? song.platforms.amazonMusic ?? "";
  const deezerLink = song.releasePlatforms?.deezer ?? song.platforms.deezer ?? "";
  const allPlatformsLink = song.releaseAllPlatforms ?? song.allPlatforms ?? "";

  const appleMusicAlbumId =
    appleMusicLink.match(/album\/_\/(\d+)/)?.[1] ??
    appleMusicLink.match(/album\/[^/]+\/(\d+)/)?.[1];

  const spotifyAlbumId = spotifyLink.match(/open\.spotify\.com\/album\/([A-Za-z0-9]+)/)?.[1];
  const amazonAlbumId = amazonLink.match(/albums\/([A-Z0-9]+)/i)?.[1];
  const deezerAlbumId = deezerLink.match(/album\/(\d+)/)?.[1];

  return (appleMusicAlbumId ?? spotifyAlbumId ?? amazonAlbumId ?? deezerAlbumId ?? allPlatformsLink) || song.subtitle;
}

function getReleaseTitle(song: Song) {
  return song.subtitle.replace(/\s+-\s+(Single|EP)$/i, "");
}

function slugifyReleaseTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const releasesByKey = new Map<string, Release>();

[...catalogSongs]
  .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime())
  .forEach((song) => {
    const key = getReleaseKey(song);
    const existing = releasesByKey.get(key);

    if (existing) {
      existing.tracks.push(song);
      return;
    }

    releasesByKey.set(key, {
      key,
      slug: slugifyReleaseTitle(getReleaseTitle(song)),
      title: getReleaseTitle(song),
      subtitle: song.subtitle,
      releaseDate: song.releaseDate,
      art: song.art,
      allPlatforms: song.allPlatforms,
      platforms: song.platforms,
      tracks: [song],
    });
  });

export const catalogReleases: Release[] = Array.from(releasesByKey.values()).map((release) => {
  const override = releaseOverrides[release.slug];
  if (!override) {
    return release;
  }

  return {
    ...release,
    ...override,
    platforms: override.platforms ?? release.platforms,
  };
});

export const featuredSongOrder: SongSlug[] = ["emergence", "memories", "midnight", "september"];

export const playlists: PlaylistCard[] = [
  {
    title: "slow piano songs to calm your mind",
    description: "A softer piano playlist for quiet listening, slower focus, and calmer evenings.",
    href: "https://open.spotify.com/playlist/4oKQ05sH2jt9Ha9kZjoTI2?si=fb57e3189b07413b",
    label: "Open playlist",
  },
  {
    title: "Wallerstedt Live Piano",
    description: "A playlist centered on my own piano releases in one place on Spotify.",
    href: "https://open.spotify.com/playlist/70Gni8PKbRB1DlJ9z9z2PM?si=3b4f787916ee484f",
    label: "Open playlist",
  },
  {
    title: "All Releases",
    description: "My Spotify artist page with singles, EPs, and the latest release.",
    href: "https://open.spotify.com/artist/7qBBYMwk5wXAjSXWWhPCxK?si=YrgOKG1XSCeGS06AzwWUQQ",
    label: "Open Spotify",
  },
];

export const socialLinks: SocialLink[] = [
  { key: "spotify", label: "Spotify", href: "https://open.spotify.com/artist/7qBBYMwk5wXAjSXWWhPCxK?si=YrgOKG1XSCeGS06AzwWUQQ" },
  { key: "appleMusic", label: "Apple Music", href: "https://music.apple.com/us/artist/wallerstedt/1689400214" },
  { key: "instagram", label: "Instagram", href: "https://www.instagram.com/c.wallerstedt?igsh=MWw1aWV4OHNnazl4bQ%3D%3D&utm_source=qr" },
  { key: "youtube", label: "YouTube", href: "https://www.youtube.com/@cwallerstedt" },
  { key: "tiktok", label: "TikTok", href: "https://www.tiktok.com/@cwallerstedt" },
  { key: "patreon", label: "Patreon", href: "https://patreon.com/Wallerstedt?utm_medium=unknown&utm_source=join_link&utm_campaign=creatorshare_creator&utm_content=copyLink" },
];

export function getSong(slug: string) {
  return songs[slug];
}

export function getRelease(slug: string) {
  return catalogReleases.find((release) => release.slug === slug);
}

export function getReleaseForSong(songSlug: string) {
  return catalogReleases.find((release) => release.tracks.some((track) => track.slug === songSlug));
}

function applyReleaseOverrides(releases: Release[]) {
  return releases.map((release) => {
    const override = releaseOverrides[release.slug];
    if (!override) {
      return release;
    }

    return {
      ...release,
      ...override,
      platforms: override.platforms ?? release.platforms,
    };
  });
}

function buildCatalogReleases(entries: Song[]) {
  const dynamicReleasesByKey = new Map<string, Release>();

  [...entries]
    .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime())
    .forEach((song) => {
      const key = getReleaseKey(song);
      const existing = dynamicReleasesByKey.get(key);

      if (existing) {
        existing.tracks.push(song);
        if (song.releaseArt) {
          existing.art = song.releaseArt;
        }
        if (song.releaseAllPlatforms) {
          existing.allPlatforms = song.releaseAllPlatforms;
        }
        if (song.releasePlatforms && Object.keys(song.releasePlatforms).length > 0) {
          existing.platforms = song.releasePlatforms;
        }
        return;
      }

      dynamicReleasesByKey.set(key, {
        key,
        slug: slugifyReleaseTitle(getReleaseTitle(song)),
        title: getReleaseTitle(song),
        subtitle: song.subtitle,
        releaseDate: song.releaseDate,
        art: song.releaseArt ?? song.art,
        allPlatforms: song.releaseAllPlatforms ?? song.allPlatforms,
        platforms: song.releasePlatforms ?? song.platforms,
        tracks: [song],
      });
    });

  return applyReleaseOverrides(Array.from(dynamicReleasesByKey.values()));
}

export async function getCatalogSongs() {
  noStore();

  try {
    const raw = await readFile(songCatalogPath, "utf8");
    return JSON.parse(raw) as Song[];
  } catch {
    return catalogSongs;
  }
}

export async function saveCatalogSongs(entries: Song[]) {
  await mkdir(path.dirname(songCatalogPath), { recursive: true });
  await writeFile(songCatalogPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  return entries;
}

export async function getSongsMap() {
  const entries = await getCatalogSongs();
  return Object.fromEntries(entries.map((song) => [song.slug, song])) as Record<string, Song>;
}

export async function getCatalogReleases() {
  const entries = await getCatalogSongs();
  return buildCatalogReleases(entries);
}

export async function getLatestRelease() {
  const releases = await getCatalogReleases();
  return releases[0] ?? null;
}

export async function getSongBySlug(slug: string) {
  const entries = await getSongsMap();
  return entries[slug];
}

export async function getReleaseBySlug(slug: string) {
  const releases = await getCatalogReleases();
  return releases.find((release) => release.slug === slug);
}

export async function getReleaseForSongSlug(songSlug: string) {
  const releases = await getCatalogReleases();
  return releases.find((release) => release.tracks.some((track) => track.slug === songSlug));
}

export function slugifySongTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractSpotifyId(spotifyLink: string) {
  return spotifyLink.match(/open\.spotify\.com\/(?:track|album)\/([A-Za-z0-9]+)/)?.[1] ?? "";
}

function buildSpotifyEmbed(spotifyLink: string) {
  const trackId = spotifyLink.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/)?.[1];
  if (trackId) {
    return `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;
  }

  const albumId = spotifyLink.match(/open\.spotify\.com\/album\/([A-Za-z0-9]+)/)?.[1];
  if (albumId) {
    return `https://open.spotify.com/embed/album/${albumId}?utm_source=generator&theme=0`;
  }

  return "";
}

function normalizeSongField(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function formatReleaseDate(value: string) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function createSongFromFormData(formData: FormData): Song {
  const title = normalizeSongField(formData.get("title"));
  const spotifyLink = normalizeSongField(formData.get("spotifyHref"));
  const releaseTitle = normalizeSongField(formData.get("releaseTitle")) || title;
  const releaseType = normalizeSongField(formData.get("releaseType")) || "Single";
  const slug = normalizeSongField(formData.get("slug")) || slugifySongTitle(title);
  const note = normalizeSongField(formData.get("note"));
  const releaseSpotifyLink = normalizeSongField(formData.get("releaseSpotifyHref"));
  const releaseAppleMusicLink = normalizeSongField(formData.get("releaseAppleMusicHref"));
  const releaseAmazonMusicLink = normalizeSongField(formData.get("releaseAmazonMusicHref"));
  const releaseDeezerLink = normalizeSongField(formData.get("releaseDeezerHref"));
  const releaseSoundcloudLink = normalizeSongField(formData.get("releaseSoundcloudHref"));
  const releaseTidalLink = normalizeSongField(formData.get("releaseTidalHref"));
  const releasePlatforms = {
    spotify: releaseSpotifyLink || undefined,
    appleMusic: releaseAppleMusicLink || undefined,
    amazonMusic: releaseAmazonMusicLink || undefined,
    deezer: releaseDeezerLink || undefined,
    soundcloud: releaseSoundcloudLink || undefined,
    tidal: releaseTidalLink || undefined,
  } satisfies PlatformLinks;
  const hasReleaseOverrides = Object.values(releasePlatforms).some(Boolean);

  return {
    slug,
    spotifyId: normalizeSongField(formData.get("spotifyId")) || extractSpotifyId(spotifyLink),
    title,
    subtitle: `${releaseTitle} - ${releaseType}`,
    releaseDate: formatReleaseDate(normalizeSongField(formData.get("releaseDate"))),
    art: normalizeSongField(formData.get("art")),
    blurb: normalizeSongField(formData.get("blurb")) || `${title} by Wallerstedt.`,
    note,
    embed: normalizeSongField(formData.get("embed")) || buildSpotifyEmbed(spotifyLink),
    allPlatforms: normalizeSongField(formData.get("allPlatforms")) || spotifyLink,
    platforms: {
      spotify: spotifyLink || undefined,
      appleMusic: normalizeSongField(formData.get("appleMusicHref")) || undefined,
      amazonMusic: normalizeSongField(formData.get("amazonMusicHref")) || undefined,
      deezer: normalizeSongField(formData.get("deezerHref")) || undefined,
      soundcloud: normalizeSongField(formData.get("soundcloudHref")) || undefined,
      tidal: normalizeSongField(formData.get("tidalHref")) || undefined,
    },
    releaseArt: normalizeSongField(formData.get("releaseArt")) || undefined,
    releaseAllPlatforms: normalizeSongField(formData.get("releaseAllPlatforms")) || undefined,
    releasePlatforms: hasReleaseOverrides ? releasePlatforms : undefined,
  };
}

export async function addSong(formData: FormData) {
  const nextSong = createSongFromFormData(formData);
  const entries = await getCatalogSongs();

  if (!nextSong.title || !nextSong.subtitle || !nextSong.releaseDate || !nextSong.art) {
    return { ok: false as const, message: "Title, release title, release date, and art path are required." };
  }

  if (!nextSong.slug) {
    return { ok: false as const, message: "Slug could not be generated." };
  }

  if (!nextSong.platforms.spotify) {
    return { ok: false as const, message: "Spotify link is required." };
  }

  if (!nextSong.embed) {
    return { ok: false as const, message: "Embed URL is required, or use a valid Spotify link." };
  }

  if (entries.some((song) => song.slug === nextSong.slug)) {
    return { ok: false as const, message: "A song with that slug already exists." };
  }

  const nextEntries = [...entries, nextSong].sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
  await saveCatalogSongs(nextEntries);

  return { ok: true as const, message: "Song added.", song: nextSong };
}
