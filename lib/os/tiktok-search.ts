export type TikTokSearchResult = {
  awemeId: string;
  uniqueId: string;
  desc: string;
  playCount: number | null;
  diggCount: number | null;
  coverUrl: string | null;
  url: string;
};

export const TIKTOK_SEARCH_DEFAULT_LIMIT = 15;
export const TIKTOK_SEARCH_MAX_LIMIT = 30;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstHttpUrl(node: unknown): string | null {
  const rec = asRecord(node);
  if (!rec) return null;
  const list = rec.url_list;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (typeof item === "string" && /^https?:\/\//i.test(item)) return item;
    }
  }
  return typeof rec.url === "string" && /^https?:\/\//i.test(rec.url) ? rec.url : null;
}

export function pickCoverUrl(video: unknown): string | null {
  const rec = asRecord(video);
  if (!rec) return null;
  return firstHttpUrl(rec.cover) ?? firstHttpUrl(rec.origin_cover) ?? firstHttpUrl(rec.dynamic_cover);
}

export function tiktokHandle(uniqueId: string) {
  return uniqueId.trim().replace(/^@+/, "");
}

/** Clean watch URL — no search path, no Gmail wrappers. */
export function tiktokVideoUrl(uniqueId: string, awemeId: string) {
  const handle = tiktokHandle(uniqueId);
  return `https://www.tiktok.com/@${handle}/video/${awemeId}`;
}

export function formatTikTokCount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs < 1000) return `${sign}${Math.round(abs)}`;
  const [divisor, suffix] =
    abs >= 1_000_000_000
      ? [1_000_000_000, "B"]
      : abs >= 1_000_000
        ? [1_000_000, "M"]
        : [1_000, "K"];
  const scaled = abs / divisor;
  const digits = scaled >= 10 ? 0 : 1;
  const rounded = Number(scaled.toFixed(digits));
  return `${sign}${rounded}${suffix}`;
}

function rankScore(result: TikTokSearchResult) {
  return result.playCount ?? result.diggCount ?? -1;
}

export function rankTikTokResults(results: TikTokSearchResult[]) {
  return [...results].sort((a, b) => {
    const byViews = rankScore(b) - rankScore(a);
    if (byViews !== 0) return byViews;
    return (b.diggCount ?? -1) - (a.diggCount ?? -1);
  });
}

function parseAwemeInfo(info: Record<string, unknown>): TikTokSearchResult | null {
  const awemeId = asText(info.aweme_id) ?? asText(info.awemeId);
  const author = asRecord(info.author);
  const uniqueId = tiktokHandle(
    asText(author?.unique_id) ?? asText(author?.uniqueId) ?? "",
  );
  if (!awemeId || !uniqueId) return null;
  const stats = asRecord(info.statistics);
  return {
    awemeId,
    uniqueId,
    desc: asText(info.desc) ?? "",
    playCount: asCount(stats?.play_count) ?? asCount(stats?.playCount),
    diggCount: asCount(stats?.digg_count) ?? asCount(stats?.diggCount),
    coverUrl: pickCoverUrl(info.video),
    url: tiktokVideoUrl(uniqueId, awemeId),
  };
}

/**
 * Treg wraps the provider payload in `output`. Videos live at
 * `output.videos[].aweme_info`.
 */
export function parseTregTikTokSearch(payload: unknown): TikTokSearchResult[] {
  const root = asRecord(payload);
  const output = asRecord(root?.output) ?? root;
  const videos = output?.videos;
  if (!Array.isArray(videos)) return [];

  const results: TikTokSearchResult[] = [];
  const seen = new Set<string>();
  for (const item of videos) {
    const rec = asRecord(item);
    if (!rec) continue;
    const info = asRecord(rec.aweme_info) ?? rec;
    const parsed = parseAwemeInfo(info);
    if (!parsed) continue;
    if (seen.has(parsed.awemeId)) continue;
    seen.add(parsed.awemeId);
    results.push(parsed);
  }
  return rankTikTokResults(results);
}
