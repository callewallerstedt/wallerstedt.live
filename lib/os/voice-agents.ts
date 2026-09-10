export const VOICE_AGENT_SLUGS = ["elon", "bjorn", "jensen", "max", "nils", "jan", "rayner"] as const;
export type VoiceAgentSlug = typeof VOICE_AGENT_SLUGS[number];
type VoiceAgent = { agent: VoiceAgentSlug; url: string; token: string };

export function normalizeVoiceAgent(name: string): VoiceAgentSlug | undefined {
  const slug = name.trim().toLowerCase().normalize("NFC");
  const canonical = slug === "björn" ? "bjorn" : slug === "boss" ? "elon" : slug;
  return VOICE_AGENT_SLUGS.find((agent) => agent === canonical);
}

/** Server only: resolved entries contain webhook credentials. */
export function resolveVoiceAgent(name: string): VoiceAgent | undefined {
  const agent = normalizeVoiceAgent(name);
  if (!agent) return undefined;
  let webhooks: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(process.env.VOICE_AGENT_WEBHOOKS || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) webhooks = parsed as Record<string, unknown>;
  } catch { /* Invalid configuration is treated as unavailable. */ }
  const key = Object.keys(webhooks).find((key) => key === agent)
    ?? Object.keys(webhooks).find((key) => normalizeVoiceAgent(key) === agent);
  const entry = key === undefined && agent === "elon"
    ? { url: process.env.BOSS_VOICE_WEBHOOK_URL, token: process.env.BOSS_VOICE_WEBHOOK_TOKEN }
    : key === undefined ? undefined : webhooks[key];
  if (!entry || typeof entry !== "object") return undefined;
  const { url, token } = entry as Record<string, unknown>;
  if (typeof url !== "string" || typeof token !== "string" || !token.trim()) return undefined;
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return undefined;
  } catch { return undefined; }
  return { agent, url, token };
}

/** Configured slugs only; never expose credentials to callers listing agents. */
export function listVoiceAgents(): VoiceAgentSlug[] {
  return VOICE_AGENT_SLUGS.filter((agent) => resolveVoiceAgent(agent));
}

export function agentWebhookPayload(message: string, agent: VoiceAgentSlug, now = new Date()) {
  return { message, source: "wallerstedt-dash", agent, timestamp: now.toISOString() };
}
