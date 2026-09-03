import { NextResponse } from "next/server";

import { getSongBySlug } from "@/lib/site-data";

export const revalidate = 21600;

/**
 * Preview clips are served straight from Spotify's public preview host, which
 * sends `Access-Control-Allow-Origin: *` so the browser can analyse the audio.
 * The URLs rotate every so often, so the player falls back to this route to
 * resolve a fresh one instead of silently failing.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const song = await getSongBySlug(slug);

  if (!song?.spotifyId) {
    return NextResponse.json({ error: "unknown track" }, { status: 404 });
  }

  try {
    const res = await fetch(`https://open.spotify.com/embed/track/${song.spotifyId}`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; wallerstedt.live)" },
      next: { revalidate },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }

    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    const entity = match ? JSON.parse(match[1])?.props?.pageProps?.state?.data?.entity : null;
    const url: string | undefined = entity?.audioPreview?.url;

    if (!url) {
      return NextResponse.json({ error: "no preview" }, { status: 404 });
    }

    return NextResponse.json(
      { url, durationMs: entity?.duration ?? null },
      { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
