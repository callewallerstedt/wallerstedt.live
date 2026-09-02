import type { ConnectBlock, SourceId, SourceState } from "./types";

function present(...names: string[]) {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

export function detectSources(): SourceState[] {
  return [
    {
      id: "ledger",
      label: "Ledger",
      wired: true,
      detail: "Prisma AccountingEntry",
    },
    {
      id: "spotify",
      label: "Spotify",
      wired: present(
        "SPOTIFY_CLIENT_ID",
        "SPOTIFY_CLIENT_SECRET",
        "SPOTIFY_ACCESS_TOKEN",
        "SPOTIFY_FOR_ARTISTS_TOKEN",
      ),
      detail: "Streams need Spotify for Artists. Public API only yields artist profile if client credentials exist.",
    },
    {
      id: "tiktok",
      label: "TikTok",
      wired: present("TIKTOK_ACCESS_TOKEN", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"),
      detail: "No TikTok token in env",
    },
    {
      id: "distrokid",
      label: "DistroKid",
      wired: present("DISTROKID_TOKEN", "DISTROKID_API_KEY"),
      detail: "No DistroKid token in env",
    },
    {
      id: "avanza",
      label: "Avanza KF",
      wired: present("AVANZA_USERNAME", "AVANZA_TOKEN", "AVANZA_COOKIE", "AVANZA_TOTP_SECRET"),
      detail: "Ledger 1385 is deposited book value only",
    },
    {
      id: "bank",
      label: "Bank live",
      wired: present("BANK_API_TOKEN", "ENABLE_BANKING_TOKEN", "OPEN_BANKING_TOKEN"),
      detail: "Konto 1930 is booked cash, not a live bank feed",
    },
    {
      id: "wealth",
      label: "Personal trading",
      wired: true,
      detail: "Trading desk book — not bokföring",
    },
  ];
}

export function sourceById(sources: SourceState[], id: SourceId) {
  return sources.find((source) => source.id === id) ?? null;
}

export function connectBlocks(sources: SourceState[]): ConnectBlock[] {
  return sources
    .filter((source) => !source.wired)
    .map((source) => ({
      source: source.id,
      title: `${source.label} not connected`,
      detail: source.detail,
    }));
}
