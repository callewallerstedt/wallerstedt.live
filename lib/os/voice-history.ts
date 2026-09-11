import { namedVoiceAgent, type VoiceAgentSlug } from "./voice-agents";

export const VOICE_HISTORY_ROLES = ["user", "assistant", "agent", "tool"] as const;
export type VoiceHistoryRole = (typeof VOICE_HISTORY_ROLES)[number];

export type VoiceHistoryInput = {
  clientId: string;
  role: VoiceHistoryRole;
  message?: string;
  text?: string;
  images?: string[];
  agent?: string;
  occurredAt?: number;
};

export type VoiceHistoryEntry = {
  id: string;
  clientId: string;
  role: VoiceHistoryRole;
  message: string;
  images: string[];
  agent?: VoiceAgentSlug;
  timestamp: number;
};

export function voiceHistoryContent(input: VoiceHistoryInput) {
  const message = [input.message, input.text].filter(Boolean).join("\n").trim();
  const images = [...new Set(input.images ?? [])]
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" && !parsed.username && !parsed.password;
      } catch {
        return false;
      }
    })
    .slice(0, 12);
  return {
    clientId: input.clientId.trim().slice(0, 200),
    role: input.role,
    message,
    images,
    agent: namedVoiceAgent(input.agent ?? ""),
    occurredAt: new Date(
      typeof input.occurredAt === "number" && Number.isFinite(input.occurredAt)
        ? input.occurredAt
        : Date.now(),
    ),
  };
}
