import { artist } from "@/lib/artist";

/**
 * Monthly listeners, read off the public Spotify artist page once a day so the
 * number never goes stale. Falls back to the hand-kept figure in lib/artist.ts.
 */
export async function getMonthlyListeners(): Promise<number> {
  try {
    const res = await fetch(artist.spotify.split("?")[0], {
      headers: { "user-agent": "Mozilla/5.0 (compatible; wallerstedt.live)" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return artist.monthlyListeners;

    const html = await res.text();
    const exact = html.match(/([\d,]+) monthly listeners/);
    if (exact) {
      const value = Number(exact[1].replace(/,/g, ""));
      if (value > 0) return value;
    }

    const compact = html.match(/([\d.]+)([KM]) monthly listeners/);
    if (compact) {
      return Math.round(Number(compact[1]) * (compact[2] === "M" ? 1_000_000 : 1_000));
    }
  } catch {
    // Spotify unreachable — the fallback is good enough for a day.
  }

  return artist.monthlyListeners;
}

export function compactCount(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
