import { getTradingBook } from "@/lib/trading-server";

import type { OsSnapshot } from "./types";

export async function loadPersonalWealth(): Promise<OsSnapshot["wealth"]> {
  try {
    const book = await getTradingBook();
    return {
      source: "Personal trading desk",
      disclaimer:
        "Personal experiment. Not company KF, not bokföring, not a net-worth statement.",
      capitalCents: Math.round(book.experiment.capitalSek * 100),
      openPnlCents: book.stats.openPnlSek == null ? null : Math.round(book.stats.openPnlSek * 100),
      positions: book.positions.map((position) => ({
        symbol: position.symbol,
        name: position.name,
        last: position.last,
        pnlPct: position.pnlPct,
        shares: position.shares,
      })),
      updatedAt: book.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function loadSpotifyArtist() {
  const id = process.env.SPOTIFY_CLIENT_ID?.trim();
  const secret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  const existing = process.env.SPOTIFY_ACCESS_TOKEN?.trim();
  let token = existing;
  if (!token && id && secret) {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { access_token?: string };
    token = body.access_token ?? "";
  }
  if (!token) return null;
  const artistId = process.env.SPOTIFY_ARTIST_ID?.trim() || "7qBBYMwk5wXAjSXWWhPCxK";
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    name?: string;
    followers?: { total?: number };
    popularity?: number;
  };
  return {
    name: body.name ?? null,
    followers: body.followers?.total ?? null,
    popularity: body.popularity ?? null,
  };
}
