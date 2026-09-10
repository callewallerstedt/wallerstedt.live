import assert from "node:assert/strict";
import test from "node:test";
import { elonResponse, nextVoiceAction } from "./voice-readout";

const idle = { open: true, replies: 0, responding: false, speaking: false, pendingInput: 0, toolContinuation: false };

test("Elon wakes idle Live and preempts responses, playback, phantom VAD and tools", () => {
  assert.equal(nextVoiceAction({ ...idle, replies: 1 }), "elon");
  assert.equal(nextVoiceAction({ ...idle, replies: 1, responding: true, speaking: true, pendingInput: 2, toolContinuation: true }), "elon");
});

test("queued replies wait for channel open, then flush without user activity", () => {
  const state = { ...idle, replies: 2, pendingInput: 1 };
  assert.equal(nextVoiceAction({ ...state, open: false }), "wait");
  assert.equal(nextVoiceAction(state), "elon");
  assert.equal(nextVoiceAction(idle), "wait");
});

test("ordinary tool continuation still waits for speech and input", () => {
  assert.equal(nextVoiceAction({ ...idle, toolContinuation: true }), "tool");
  for (const busy of [{ speaking: true }, { responding: true }, { pendingInput: 1 }]) {
    assert.equal(nextVoiceAction({ ...idle, toolContinuation: true, ...busy }), "wait");
  }
});

test("readout requests audio with no tools for both text and image-only replies", () => {
  const event = elonResponse([{ text: "Klart!", images: [] }, { text: "", images: ["https://example.com/image.png"] }]);
  assert.equal(event.type, "response.create");
  assert.deepEqual(event.response.output_modalities, ["audio"]);
  assert.deepEqual(event.response.tools, []);
  assert.equal(event.response.tool_choice, "none");
  assert.match(event.response.instructions, /Klart!/);
  assert.match(event.response.instructions, /Elon sent an image/);
});
