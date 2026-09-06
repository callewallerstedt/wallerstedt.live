import assert from "node:assert/strict";
import test from "node:test";

import { AccountingError } from "../accounting/errors";

import { tiktokPianoSearchQuery, tiktokPianoSearchUrl } from "./task-meta";
import {
  formatTikTokCount,
  parseSavedTikTokSearch,
  parseTregTikTokSearch,
  pickCoverUrl,
  rankTikTokResults,
  savedTikTokSearchPayload,
  tiktokVideoUrl,
  type TikTokSearchResult,
} from "./tiktok-search";
import { fetchTregTikTokSearch } from "./tiktok-treg";

function result(partial: Partial<TikTokSearchResult> & Pick<TikTokSearchResult, "awemeId">): TikTokSearchResult {
  return {
    uniqueId: "pianist",
    desc: "",
    playCount: null,
    diggCount: null,
    coverUrl: null,
    url: tiktokVideoUrl("pianist", partial.awemeId),
    createTimeMs: null,
    song: null,
    ...partial,
  };
}

test("piano query matches the old TikTok search string", () => {
  assert.equal(tiktokPianoSearchQuery(" Love Story Indila "), "Love Story Indila piano");
  const url = new URL(tiktokPianoSearchUrl("Midnight Hours", 1_725_000_000_000));
  assert.equal(url.searchParams.get("q"), "Midnight Hours piano");
});

test("watch URLs are clean tiktok.com/@user/video/id links", () => {
  assert.equal(
    tiktokVideoUrl("@indila.piano", "7550123456789012345"),
    "https://www.tiktok.com/@indila.piano/video/7550123456789012345",
  );
  assert.doesNotMatch(tiktokVideoUrl("user", "1"), /gmail|search\/video|\?q=/i);
});

test("cover prefers video.cover, then origin_cover, then dynamic_cover", () => {
  assert.equal(
    pickCoverUrl({
      cover: { url_list: ["https://cdn.example/cover.jpg"] },
      origin_cover: { url_list: ["https://cdn.example/origin.jpg"] },
    }),
    "https://cdn.example/cover.jpg",
  );
  assert.equal(
    pickCoverUrl({
      origin_cover: { url_list: ["https://cdn.example/origin.jpg"] },
      dynamic_cover: { url_list: ["https://cdn.example/dyn.webp"] },
    }),
    "https://cdn.example/origin.jpg",
  );
  assert.equal(pickCoverUrl({ dynamic_cover: { url_list: ["https://cdn.example/dyn.webp"] } }), "https://cdn.example/dyn.webp");
  assert.equal(pickCoverUrl({ cover: { url_list: ["not-a-url"] } }), null);
});

test("Treg output.videos[].aweme_info is parsed, ranked, and de-duplicated", () => {
  const payload = {
    output: {
      videos: [
        {
          aweme_info: {
            aweme_id: "low",
            desc: "quiet take",
            author: { unique_id: "softkeys" },
            statistics: { play_count: 1200, digg_count: 40 },
            video: { cover: { url_list: ["https://cdn.example/low.jpg"] } },
          },
        },
        {
          aweme_info: {
            aweme_id: "high",
            desc: "Love Story piano",
            author: { unique_id: "@indila.covers" },
            statistics: { play_count: "7800000", digg_count: "220000" },
            video: {
              origin_cover: { url_list: ["https://cdn.example/high.jpg"] },
            },
          },
        },
        {
          aweme_info: {
            aweme_id: "likes-only",
            desc: "no view count",
            author: { unique_id: "anon" },
            statistics: { digg_count: 9_000 },
          },
        },
        {
          aweme_info: {
            aweme_id: "high",
            desc: "duplicate id",
            author: { unique_id: "other" },
            statistics: { play_count: 99_000_000 },
          },
        },
        {
          aweme_info: {
            desc: "missing ids",
            author: {},
          },
        },
      ],
    },
  };

  const results = parseTregTikTokSearch(payload);
  assert.deepEqual(
    results.map((item) => item.awemeId),
    ["high", "likes-only", "low"],
  );
  assert.equal(results[0]?.url, "https://www.tiktok.com/@indila.covers/video/high");
  assert.equal(results[0]?.uniqueId, "indila.covers");
  assert.equal(results[0]?.playCount, 7_800_000);
  assert.equal(results[0]?.coverUrl, "https://cdn.example/high.jpg");
  assert.equal(results[1]?.playCount, null);
  assert.equal(results[1]?.diggCount, 9_000);
});

test("rank falls back to likes when play_count is missing", () => {
  const ranked = rankTikTokResults([
    result({ awemeId: "a", playCount: 10, diggCount: 1 }),
    result({ awemeId: "b", playCount: null, diggCount: 50 }),
    result({ awemeId: "c", playCount: 10, diggCount: 8 }),
  ]);
  assert.deepEqual(
    ranked.map((item) => item.awemeId),
    ["b", "c", "a"],
  );
});

test("compact counts look like 7.8M", () => {
  assert.equal(formatTikTokCount(7_800_000), "7.8M");
  assert.equal(formatTikTokCount(15_200_000), "15M");
  assert.equal(formatTikTokCount(1_200), "1.2K");
  assert.equal(formatTikTokCount(999), "999");
  assert.equal(formatTikTokCount(null), "—");
});

test("saved search payload rehydrates ranked Treg results without Treg", () => {
  const stored = savedTikTokSearchPayload([
    result({
      awemeId: "high",
      uniqueId: "indila.covers",
      playCount: 7_800_000,
      coverUrl: "https://cdn.example/high.jpg",
      url: "https://www.tiktok.com/@indila.covers/video/high",
    }),
  ]);
  const restored = parseSavedTikTokSearch(stored);
  assert.equal(restored[0]?.awemeId, "high");
  assert.equal(restored[0]?.coverUrl, "https://cdn.example/high.jpg");
  assert.deepEqual(parseSavedTikTokSearch({ results: [{ awemeId: "x" }] }), []);
});

test("Treg search stays server-side and never puts the token in the body", async () => {
  const previous = process.env.TREG_TOKEN;
  process.env.TREG_TOKEN = "secret-token-value";
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ output: { videos: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await fetchTregTikTokSearch("indila love story piano", 15);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://treg.to/call/treg.tiktok.search.videos");
    const headers = new Headers(calls[0]?.init.headers);
    assert.equal(headers.get("X-Treg-Token"), "secret-token-value");
    const body = JSON.parse(String(calls[0]?.init.body));
    assert.deepEqual(body, { q: "indila love story piano", limit: 15 });
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.TREG_TOKEN;
    else process.env.TREG_TOKEN = previous;
  }
});

test("Treg search refuses to run without TREG_TOKEN", async () => {
  const previous = process.env.TREG_TOKEN;
  delete process.env.TREG_TOKEN;
  try {
    await assert.rejects(
      () => fetchTregTikTokSearch("x"),
      (error: unknown) => error instanceof AccountingError && error.code === "treg_not_configured",
    );
  } finally {
    if (previous === undefined) delete process.env.TREG_TOKEN;
    else process.env.TREG_TOKEN = previous;
  }
});
