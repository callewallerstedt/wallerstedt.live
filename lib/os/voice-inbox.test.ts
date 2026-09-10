import assert from "node:assert/strict";
import test from "node:test";
import { bossPayload, voiceReplyContent } from "./voice-inbox";

test("Boss outbound payload has the exact webhook fields", () => {
  assert.deepEqual(bossPayload("Hej Boss", new Date("2026-09-10T12:00:00Z")), {
    message: "Hej Boss", source: "wallerstedt-dash", timestamp: "2026-09-10T12:00:00.000Z",
  });
});
test("durable inbox content preserves text, merges image fields and canonicalizes specialists", () => {
  const url = "https://example.com/image.png";
  assert.deepEqual(voiceReplyContent({message:"One",text:"Two",agent:"Björn",images:[url],imageUrls:[url]}), {
    message:"One\nTwo", images:[url], agent:"bjorn",
  });
  assert.equal(voiceReplyContent({source:"wallerstedt-dash"}).agent, undefined);
  assert.equal(voiceReplyContent({images:Array.from({length:20},(_,i)=>`${url}?${i}`)}).images.length,12);
});
