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

export const artist = {
  name: "Calle Wallerstedt",
  shortName: "Wallerstedt",
  tagline: "Emotional piano music for late evenings, focus, and quiet rooms.",
  contact: "contact@wallerstedt.live",
  spotify: "https://open.spotify.com/artist/7qBBYMwk5wXAjSXWWhPCxK?si=YrgOKG1XSCeGS06AzwWUQQ",
  profileImage: "/media/artist-portrait.jpg",
  location: "Gothenburg, Sweden",
  bio: "Hi! I'm Wallerstedt. I'm a 20-year-old self-taught piano composer from Sweden. I write neo-classical, cinematic, film-inspired piano pieces, and I'd love for you to have a listen",
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

function getReleaseKey(song: Song) {
  const appleMusicLink = song.platforms.appleMusic ?? "";
  const spotifyLink = song.platforms.spotify ?? "";
  const amazonLink = song.platforms.amazonMusic ?? "";
  const deezerLink = song.platforms.deezer ?? "";

  const appleMusicAlbumId =
    appleMusicLink.match(/album\/_\/(\d+)/)?.[1] ??
    appleMusicLink.match(/album\/[^/]+\/(\d+)/)?.[1];

  const spotifyAlbumId = spotifyLink.match(/open\.spotify\.com\/album\/([A-Za-z0-9]+)/)?.[1];
  const amazonAlbumId = amazonLink.match(/albums\/([A-Z0-9]+)/i)?.[1];
  const deezerAlbumId = deezerLink.match(/album\/(\d+)/)?.[1];

  return appleMusicAlbumId ?? spotifyAlbumId ?? amazonAlbumId ?? deezerAlbumId ?? song.subtitle;
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

export const catalogReleases: Release[] = Array.from(releasesByKey.values());

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
  { key: "youtube", label: "YouTube", href: "https://www.youtube.com/channel/UCMC0QXQObilND0fHycaK__A" },
  { key: "tiktok", label: "TikTok", href: "https://www.tiktok.com/@cwallerstedt" },
  { key: "patreon", label: "Patreon", href: "https://patreon.com/Wallerstedt?utm_medium=unknown&utm_source=join_link&utm_campaign=creatorshare_creator&utm_content=copyLink" },
];

export function getSong(slug: string) {
  return songs[slug];
}

export function getRelease(slug: string) {
  return catalogReleases.find((release) => release.slug === slug);
}
