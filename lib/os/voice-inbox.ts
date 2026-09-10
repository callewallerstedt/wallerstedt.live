import { namedVoiceAgent, type VoiceAgentSlug } from "./voice-agents";

export type BossReplyInput = {
  message?: string;
  text?: string;
  images?: string[];
  imageUrls?: string[];
  agent?: string;
  source?: string;
};

export type BossReply = { id: string; timestamp: number; message: string; images: string[]; agent?: VoiceAgentSlug };
export function bossPayload(message: string, now = new Date()) {
  return { message, source: "wallerstedt-dash", timestamp: now.toISOString() };
}

export function voiceReplyContent(input: BossReplyInput) {
  return {
    message: [input.message, input.text].filter(Boolean).join("\n"),
    images: [...new Set([...(input.images ?? []), ...(input.imageUrls ?? [])])].slice(0, 12),
    agent: namedVoiceAgent(input.agent, input.source),
  };
}
