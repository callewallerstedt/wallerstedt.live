import { randomUUID } from "node:crypto";
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

export class VoiceInbox {
  private entries = new Map<string, BossReply[]>();
  constructor(private ttl = 60 * 60 * 1000, private cap = 50) {}
  private prune(now: number) {
    for (const [key, items] of this.entries) {
      const live = items.filter((item) => item.timestamp > now - this.ttl);
      if (live.length) this.entries.set(key, live);
      else this.entries.delete(key);
    }
  }
  add(key: string, input: BossReplyInput, now = Date.now()) {
    this.prune(now);
    const item: BossReply = {
      id: randomUUID(), timestamp: now,
      message: [input.message, input.text].filter(Boolean).join("\n"),
      images: [...new Set([...(input.images ?? []), ...(input.imageUrls ?? [])])].slice(0, 12),
      agent: namedVoiceAgent(input.agent, input.source),
    };
    this.entries.set(key, [...(this.entries.get(key) ?? []), item].slice(-this.cap));
    return item;
  }
  read(key: string, since = 0, now = Date.now()) {
    this.prune(now);
    // Inclusive cursor prevents dropping replies received in the same millisecond.
    return (this.entries.get(key) ?? []).filter((item) => item.timestamp >= since);
  }
}

// Shared across route bundles within one Node process; intentionally not durable.
const globalInbox = globalThis as typeof globalThis & { bolagVoiceInbox?: VoiceInbox };
export const voiceInbox = globalInbox.bolagVoiceInbox ??= new VoiceInbox();
