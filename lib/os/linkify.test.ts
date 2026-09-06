import assert from "node:assert/strict";
import test from "node:test";

import { isSafeHttpUrl, splitLinkedText } from "./linkify";

test("only http and https count as safe", () => {
  assert.equal(isSafeHttpUrl("https://www.tiktok.com/@friqtao/video/1"), true);
  assert.equal(isSafeHttpUrl("http://example.com"), true);
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("data:text/html,hi"), false);
});

test("notes split into tappable https links and leftover punctuation", () => {
  const parts = splitLinkedText(
    "Ref https://www.tiktok.com/@alejs_tunes/video/123 and https://open.spotify.com/track/abc.",
  );
  assert.deepEqual(
    parts.filter((part) => part.type === "link").map((part) => part.value),
    [
      "https://www.tiktok.com/@alejs_tunes/video/123",
      "https://open.spotify.com/track/abc",
    ],
  );
  const last = parts[parts.length - 1];
  assert.equal(last?.type, "text");
  assert.equal(last?.value, ".");
});

test("javascript URLs stay plain text even if they look prefixed", () => {
  const parts = splitLinkedText("bad javascript:alert(1) and https://wallerstedt.live");
  assert.deepEqual(
    parts.filter((part) => part.type === "link").map((part) => part.value),
    ["https://wallerstedt.live"],
  );
});
