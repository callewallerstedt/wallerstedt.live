export type TikTokSearchResult = {
  awemeId: string;
  uniqueId: string;
  desc: string;
  playCount: number | null;
  diggCount: number | null;
  coverUrl: string | null;
  url: string;
  createTimeMs: number | null;
  song: string | null;
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

function asTimeMs(value: unknown): number | null {
  const count = asCount(value);
  if (count == null || count <= 0) return null;
  return count < 1_000_000_000_000 ? Math.round(count * 1000) : Math.round(count);
}

/** Pull a likely track title out of a TikTok caption when the sound is named. */
export function extractSongFromCaption(desc: string) {
  const text = desc.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const labeled = text.match(
    /(?:song|track|music|(?<!original )sound)\s*[:\-–—]\s*([^|#\n]{2,80})/i,
  );
  if (labeled?.[1]) return cleanSongTitle(labeled[1]);

  const note = text.match(/[♪♫]\s*([^|#\n]{2,80})/);
  if (note?.[1]) return cleanSongTitle(note[1]);

  const quoted = text.match(/[“"«]([^”"»]{2,80})[”"»]/);
  if (quoted?.[1] && !/^https?:/i.test(quoted[1])) return cleanSongTitle(quoted[1]);

  const dash = text.match(/^([^#\n]{2,40}?)\s[-–—]\s([^#\n]{2,40}?)(?:\s[#@]|$)/);
  if (dash?.[1] && dash[2] && !/https?:|original sound/i.test(dash[0])) {
    return cleanSongTitle(`${dash[1]} - ${dash[2]}`);
  }
  return null;
}

function cleanSongTitle(value: string) {
  const cleaned = value.replace(/\s+/g, " ").replace(/^[-–—\s]+|[-–—\s]+$/g, "").trim();
  if (cleaned.length < 2 || /^original sound\b/i.test(cleaned)) return null;
  return cleaned.slice(0, 80);
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

function parseAwemeInfo(
  info: Record<string, unknown>,
  fallbackHandle = "",
): TikTokSearchResult | null {
  const awemeId = asText(info.aweme_id) ?? asText(info.awemeId) ?? asText(info.id);
  const author = asRecord(info.author);
  const uniqueId = tiktokHandle(
    asText(author?.unique_id) ??
      asText(author?.uniqueId) ??
      asText(info.unique_id) ??
      fallbackHandle,
  );
  if (!awemeId || !uniqueId) return null;
  const stats = asRecord(info.statistics) ?? asRecord(info.stats);
  const desc = asText(info.desc) ?? asText(info.title) ?? "";
  return {
    awemeId,
    uniqueId,
    desc,
    playCount:
      asCount(stats?.play_count) ??
      asCount(stats?.playCount) ??
      asCount(stats?.play_cnt) ??
      asCount(info.play_count),
    diggCount:
      asCount(stats?.digg_count) ??
      asCount(stats?.diggCount) ??
      asCount(stats?.like_count) ??
      asCount(info.digg_count),
    coverUrl: pickCoverUrl(info.video) ?? pickCoverUrl(info),
    url: tiktokVideoUrl(uniqueId, awemeId),
    createTimeMs:
      asTimeMs(info.create_time) ?? asTimeMs(info.createTime) ?? asTimeMs(info.create_time_ms),
    song: extractSongFromCaption(desc),
  };
}

/**
 * Treg wraps the provider payload in `output`. Videos live at
 * `output.videos[].aweme_info`.
 */
export function parseTregTikTokVideos(
  payload: unknown,
  fallbackHandle = "",
): TikTokSearchResult[] {
  const root = asRecord(payload);
  const output = asRecord(root?.output) ?? root;
  const videos = output?.videos ?? output?.aweme_list;
  if (!Array.isArray(videos)) return [];

  const results: TikTokSearchResult[] = [];
  const seen = new Set<string>();
  for (const item of videos) {
    const rec = asRecord(item);
    if (!rec) continue;
    const info = asRecord(rec.aweme_info) ?? rec;
    const parsed = parseAwemeInfo(info, fallbackHandle);
    if (!parsed) continue;
    if (seen.has(parsed.awemeId)) continue;
    seen.add(parsed.awemeId);
    results.push(parsed);
  }
  return rankTikTokResults(results);
}

export function parseTregTikTokSearch(payload: unknown): TikTokSearchResult[] {
  return parseTregTikTokVideos(payload);
}

function isStoredResult(value: unknown): value is TikTokSearchResult {
  const rec = asRecord(value);
  if (!rec) return false;
  if (typeof rec.awemeId !== "string" || !rec.awemeId.trim()) return false;
  if (typeof rec.uniqueId !== "string" || !rec.uniqueId.trim()) return false;
  if (typeof rec.url !== "string" || !/^https?:\/\//i.test(rec.url)) return false;
  return true;
}

/** Rehydrate a saved CompanyTikTokSearch.payload without calling Treg. */
export function parseSavedTikTokSearch(payload: unknown): TikTokSearchResult[] {
  const rec = asRecord(payload);
  const list = Array.isArray(payload) ? payload : rec?.results;
  if (!Array.isArray(list)) return [];
  const results: TikTokSearchResult[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!isStoredResult(item)) continue;
    if (seen.has(item.awemeId)) continue;
    seen.add(item.awemeId);
    results.push({
      awemeId: item.awemeId,
      uniqueId: tiktokHandle(item.uniqueId),
      desc: typeof item.desc === "string" ? item.desc : "",
      playCount: asCount(item.playCount),
      diggCount: asCount(item.diggCount),
      coverUrl:
        typeof item.coverUrl === "string" && /^https?:\/\//i.test(item.coverUrl)
          ? item.coverUrl
          : null,
      url: item.url,
      createTimeMs: asCount(item.createTimeMs),
      song: typeof item.song === "string" && item.song.trim() ? item.song : null,
    });
  }
  return results;
}

export function savedTikTokSearchPayload(results: TikTokSearchResult[]) {
  return { results };
}

export type TikTokProfile = {
  username: string;
  secUid: string;
  nickname: string;
  followers: number | null;
};

export function parseTregTikTokProfile(payload: unknown): TikTokProfile | null {
  const root = asRecord(payload);
  const output = asRecord(root?.output) ?? root;
  if (!output) return null;
  const user = asRecord(output.user) ?? asRecord(output.userInfo) ?? output;
  const username = tiktokHandle(
    asText(output.username) ??
      asText(user.username) ??
      asText(user.unique_id) ??
      asText(user.uniqueId) ??
      "",
  );
  const secUid =
    asText(output.sec_uid) ??
    asText(output.secUid) ??
    asText(user.sec_uid) ??
    asText(user.secUid) ??
    asText(user.sec_user_id) ??
    "";
  if (!username && !secUid) return null;
  return {
    username,
    secUid,
    nickname: asText(output.nickname) ?? asText(user.nickname) ?? asText(user.nick_name) ?? username,
    followers:
      asCount(output.followers) ??
      asCount(output.follower_count) ??
      asCount(asRecord(user.follower_count)?.follower_count) ??
      asCount(asRecord(user.stats)?.follower_count) ??
      asCount(user.follower_count),
  };
}
