import assert from "node:assert/strict";
import test from "node:test";
import { agentWebhookPayload, listVoiceAgents, normalizeVoiceAgent, resolveVoiceAgent } from "./voice-agents";

test("voice agents resolve aliases, prefer JSON, and fall back only for missing Elon", (t) => {
  const keys = ["VOICE_AGENT_WEBHOOKS", "BOSS_VOICE_WEBHOOK_URL", "BOSS_VOICE_WEBHOOK_TOKEN"];
  const original = keys.map((key) => process.env[key]);
  t.after(() => keys.forEach((key, index) => {
    if (original[index] === undefined) delete process.env[key];
    else process.env[key] = original[index];
  }));
  process.env.BOSS_VOICE_WEBHOOK_URL = "https://legacy.example.com/voice";
  process.env.BOSS_VOICE_WEBHOOK_TOKEN = "legacy-token";
  process.env.VOICE_AGENT_WEBHOOKS = JSON.stringify({
    elon: { url: "https://elon.example.com/voice", token: "elon-token" },
    bjorn: { url: "https://bjorn.example.com/voice", token: "bjorn-token" },
    jensen: { url: "https://jensen.example.com/voice", token: "jensen-token" },
  });
  assert.equal(resolveVoiceAgent(" BOSS ")?.token, "elon-token");
  assert.equal(resolveVoiceAgent("BJÖRN")?.agent, "bjorn");
  assert.equal(resolveVoiceAgent(" Jensen ")?.token, "jensen-token");
  assert.deepEqual(listVoiceAgents(), ["elon", "bjorn", "jensen"]);
  assert.equal(resolveVoiceAgent("unknown"), undefined);
  assert.equal(resolveVoiceAgent("toString"), undefined);
  assert.equal(resolveVoiceAgent("max"), undefined);
  process.env.VOICE_AGENT_WEBHOOKS = "{}";
  assert.equal(resolveVoiceAgent("elon")?.token, "legacy-token");
  process.env.VOICE_AGENT_WEBHOOKS = '{"elon":{"url":"invalid","token":"token"}}';
  assert.equal(resolveVoiceAgent("elon"), undefined);
  for (const value of ["invalid JSON", "null", "[]"]) {
    process.env.VOICE_AGENT_WEBHOOKS = value;
    assert.equal(resolveVoiceAgent("rayner"), undefined);
    assert.equal(resolveVoiceAgent("elon")?.token, "legacy-token");
  }
});

test("normalization and webhook payload use canonical slugs", () => {
  assert.equal(normalizeVoiceAgent(" Bjo\u0308rn "), "bjorn");
  assert.deepEqual(agentWebhookPayload("Hello", "jensen", new Date("2026-09-10T12:00:00Z")), {
    message: "Hello", source: "wallerstedt-dash", agent: "jensen", timestamp: "2026-09-10T12:00:00.000Z",
  });
});
