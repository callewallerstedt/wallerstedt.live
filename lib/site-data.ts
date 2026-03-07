import songCatalog from "./song-catalog.json";

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

export const artist = {
  name: "Calle Wallerstedt",
  shortName: "Wallerstedt",
  tagline: "Emotional piano music for late evenings, focus, and quiet rooms.",
  contact: "contact@wallerstedt.live",
  spotify: "https://open.spotify.com/artist/7qBBYMwk5wXAjSXWWhPCxK?si=YrgOKG1XSCeGS06AzwWUQQ",
} as const;

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

export const featuredSongOrder: SongSlug[] = ["emergence", "memories", "midnight", "september"];

export const playlists: PlaylistCard[] = [
  {
    title: "Deep Focus Piano",
    description: "A calm study-hour playlist built around softer pieces and minimal piano textures.",
    href: "https://open.spotify.com/playlist/4oKQ05sH2jt9Ha9kZjoTI2?si=fb57e3189b07413b",
    label: "Open playlist",
  },
  {
    title: "Late Night Piano",
    description: "The quieter side of the catalog for evening listening and slow work sessions.",
    href: "https://open.spotify.com/playlist/70Gni8PKbRB1DlJ9z9z2PM?si=3b4f787916ee484f",
    label: "Open playlist",
  },
  {
    title: "All Releases",
    description: "Start at the artist page and move through singles, EPs, and the newest release.",
    href: "https://open.spotify.com/artist/7qBBYMwk5wXAjSXWWhPCxK?si=YrgOKG1XSCeGS06AzwWUQQ",
    label: "Open Spotify",
  },
];

export const socialLinks: SocialLink[] = [
  { key: "spotify", label: "Spotify", href: "https://open.spotify.com/artist/7qBBYMwk5wXAjSXWWhPCxK?si=YrgOKG1XSCeGS06AzwWUQQ" },
  { key: "appleMusic", label: "Apple Music", href: "https://music.apple.com/us/artist/wallerstedt/1689400214" },
  { key: "instagram", label: "Instagram", href: "https://www.instagram.com/c.wallerstedt?igsh=MWw1aWV4OHNnazl4bQ%3D%3D&utm_source=qr" },
  { key: "youtube", label: "YouTube", href: "https://www.youtube.com/channel/UCMC0QXQObilND0fHycaK__A" },
  { key: "tiktok", label: "TikTok", href: "https://www.tiktok.com/search?q=cwallerstedt" },
  { key: "patreon", label: "Patreon", href: "https://patreon.com/Wallerstedt?utm_medium=unknown&utm_source=join_link&utm_campaign=creatorshare_creator&utm_content=copyLink" },
];

export function getSong(slug: string) {
  return songs[slug];
}
