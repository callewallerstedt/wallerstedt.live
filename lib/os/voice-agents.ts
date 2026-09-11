export const VOICE_AGENT_SLUGS = ["elon", "bjorn", "jensen", "max", "nils", "jan", "rayner"] as const;
export type VoiceAgentSlug = typeof VOICE_AGENT_SLUGS[number];
type VoiceAgent = { agent: VoiceAgentSlug; url: string; token: string };

/** Grok Bot agent ids (Calle's roster). Safe client-side — not webhook secrets. */
export const VOICE_AGENT_IDS: Record<VoiceAgentSlug, string> = {
  elon: "e685b5e5-2928-4ac5-a687-266c691dd0a6",
  bjorn: "e7ea2c41-5217-41bc-8e9b-fad5b422a115",
  jensen: "1bd22793-acb4-4f4e-b2e6-623658691437",
  max: "f359bfaf-c0b1-4f74-bf96-d863f1097c46",
  nils: "d4c2fe1f-07db-4339-b220-97d8395fcb23",
  jan: "dfcd26a7-615c-46fb-8185-752cd9f7ea1c",
  rayner: "921dff6b-306a-43e3-be90-bc73d650650a",
};

/**
 * Best-effort URL that opens this agent's Grok Bot chat.
 * Prefer NEXT_PUBLIC_VOICE_AGENT_CHAT_URLS (slug → url) or
 * NEXT_PUBLIC_GROK_BOT_AGENT_URL_TEMPLATE with `{id}` / `{agent}`.
 * Returns undefined when none is configured (Live then expands the outbound text).
 */
export function voiceAgentChatUrl(agent: VoiceAgentSlug): string | undefined {
  const id = VOICE_AGENT_IDS[agent];
  try {
    const raw = process.env.NEXT_PUBLIC_VOICE_AGENT_CHAT_URLS;
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const entry = (parsed as Record<string, unknown>)[agent];
        if (typeof entry === "string" && entry.trim()) return entry.trim();
      }
    }
  } catch { /* Invalid public config is ignored. */ }
  const template = process.env.NEXT_PUBLIC_GROK_BOT_AGENT_URL_TEMPLATE?.trim();
  if (template && id) return template.replaceAll("{id}", id).replaceAll("{agent}", agent);
  return undefined;
}


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

export function voiceAgentLabel(agent: string) {
  const slug = normalizeVoiceAgent(agent) ?? agent.trim().toLowerCase();
  if (slug === "bjorn") return "Björn";
  return slug ? slug[0].toUpperCase() + slug.slice(1) : "Elon";
}

/** First recognisable specialist name; ignores dashboard source labels. */
export function namedVoiceAgent(...names: Array<string | undefined>): VoiceAgentSlug | undefined {
  for (const name of names) {
    const agent = name ? normalizeVoiceAgent(name) : undefined;
    if (agent) return agent;
  }
}

export function replyVoiceAgent(...names: Array<string | undefined>): VoiceAgentSlug {
  return namedVoiceAgent(...names) ?? "elon";
}
