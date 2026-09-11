import assert from "node:assert/strict";
import test from "node:test";
import { voiceHistoryContent } from "./voice-history";

test("durable history content keeps text, https images and specialist identity", () => {
  const url = "https://example.com/image.png";
  const content = voiceHistoryContent({
    clientId: "agent-1",
    role: "agent",
    message: "One",
    text: "Two",
    agent: "Björn",
    images: [url, "http://insecure.example/x.png", url],
    occurredAt: 1_700_000_000_000,
  });
  assert.equal(content.clientId, "agent-1");
  assert.equal(content.role, "agent");
  assert.equal(content.message, "One\nTwo");
  assert.deepEqual(content.images, [url]);
  assert.equal(content.agent, "bjorn");
  assert.equal(content.occurredAt.getTime(), 1_700_000_000_000);
  assert.equal(voiceHistoryContent({
    clientId: ` ${"x".repeat(250)} `,
    role: "tool",
    text: "Sent to Elon",
  }).clientId.length, 200);
});

test("empty history content stays empty after trim", () => {
  assert.equal(voiceHistoryContent({ clientId: "a1", role: "assistant", message: "  " }).message, "");
  assert.deepEqual(voiceHistoryContent({ clientId: "a1", role: "assistant", images: ["not-a-url"] }).images, []);
});
