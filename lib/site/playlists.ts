import type { PlaylistCard } from "@/lib/site-data";
import { DEFAULT_ACCENT } from "@/lib/site/types";

export interface SitePlaylist {
  id: string;
  title: string;
  href: string;
  cover: string | null;
  songs: number | null;
  accent: string;
}

/** Cover, name and song count off Spotify's public embed page, refreshed daily. */
async function readPlaylist(id: string) {
  try {
    const res = await fetch(`https://open.spotify.com/embed/playlist/${id}`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; wallerstedt.live)" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    const entity = match ? JSON.parse(match[1])?.props?.pageProps?.state?.data?.entity : null;
    if (!entity) return null;

    const images: Array<{ url: string; maxWidth: number }> = entity.visualIdentity?.image ?? [];
    const cover = images.sort((a, b) => b.maxWidth - a.maxWidth)[0]?.url ?? entity.coverArt?.sources?.[0]?.url ?? null;
    const base = entity.visualIdentity?.backgroundTintedBase;

    return {
      title: String(entity.name ?? ""),
      cover,
      songs: Array.isArray(entity.trackList) ? entity.trackList.length : null,
      accent: base ? `${base.red} ${base.green} ${base.blue}` : DEFAULT_ACCENT,
    };
  } catch {
    return null;
  }
}

/** Only real Spotify playlists from the admin-managed list; artist links etc. are skipped. */
export async function getPlaylists(cards: PlaylistCard[]): Promise<SitePlaylist[]> {
  const playlists = cards
    .map((card) => ({ card, id: card.href.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/)?.[1] }))
    .filter((entry): entry is { card: PlaylistCard; id: string } => Boolean(entry.id));

  return Promise.all(
    playlists.map(async ({ card, id }) => {
      const live = await readPlaylist(id);
      return {
        id,
        title: live?.title || card.title,
        href: `https://open.spotify.com/playlist/${id}`,
        cover: live?.cover ?? null,
        songs: live?.songs ?? null,
        accent: live?.accent ?? DEFAULT_ACCENT,
      };
    }),
  );
}
