import assert from "node:assert/strict";
import test from "node:test";
import { bossPayload, VoiceInbox } from "./voice-inbox";

test("Boss outbound payload has the exact webhook fields", () => {
  assert.deepEqual(bossPayload("Hej Boss", new Date("2026-09-10T12:00:00Z")), {
    message: "Hej Boss", source: "wallerstedt-dash", timestamp: "2026-09-10T12:00:00.000Z",
  });
});
test("inbox isolates owners, caps size, expires replies and keeps cursor ties", () => {
  const inbox = new VoiceInbox(1000, 2);
  inbox.add("a", { text: "first" }, 100);
  inbox.add("b", { text: "private" }, 100);
  inbox.add("a", { text: "second" }, 200);
  inbox.add("a", { text: "third" }, 200);
  assert.deepEqual(inbox.read("a", 200, 300).map((item) => item.message), ["second", "third"]);
  assert.equal(inbox.read("b", 0, 300)[0].message, "private");
  assert.deepEqual(inbox.read("a", 0, 1200), []);
});
test("inbox accepts both image fields and deduplicates", () => {
  const url = "https://example.com/image.png";
  const inbox = new VoiceInbox();
  assert.deepEqual(inbox.add("a", { images: [url], imageUrls: [url] }).images, [url]);
});
