import assert from "node:assert/strict";
import test from "node:test";

import { tiktokPianoSearchUrl } from "./task-meta";

test("TikTok piano search hits the video results path with a timestamp", () => {
  const url = new URL(tiktokPianoSearchUrl("Midnight Hours", 1_725_000_000_000));
  assert.equal(url.origin + url.pathname, "https://www.tiktok.com/search/video");
  assert.equal(url.searchParams.get("q"), "Midnight Hours piano");
  assert.equal(url.searchParams.get("t"), "1725000000000");
});
