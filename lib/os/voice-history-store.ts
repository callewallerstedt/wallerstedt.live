import { createHash } from "node:crypto";
import { getAccountingDb } from "@/lib/accounting/db";
import { namedVoiceAgent } from "./voice-agents";
import {
  voiceHistoryContent,
  type VoiceHistoryEntry,
  type VoiceHistoryInput,
  type VoiceHistoryRole,
} from "./voice-history";

const ownerHash = (key: string) => createHash("sha256").update(key).digest("hex");
/** Keep roughly a month of Live chat; UI still caps display at 200 turns. */
const ttl = 30 * 24 * 60 * 60 * 1000;
const limit = 200;

function asRole(value: string): VoiceHistoryRole {
  return value === "user" || value === "assistant" || value === "agent" || value === "tool"
    ? value
    : "assistant";
}

function toEntry(row: {
  id: string;
  clientId: string;
  role: string;
  message: string;
  images: string[];
  agent: string | null;
  occurredAt: Date;
}): VoiceHistoryEntry {
  return {
    id: row.id,
    clientId: row.clientId,
    role: asRole(row.role),
    message: row.message,
    images: row.images,
    agent: namedVoiceAgent(row.agent ?? ""),
    timestamp: row.occurredAt.getTime(),
  };
}

/** Upsert a finalized Live transcript turn. Idempotent on (owner, clientId). */
export async function saveVoiceHistory(key: string, input: VoiceHistoryInput): Promise<VoiceHistoryEntry> {
  const db = getAccountingDb();
  const content = voiceHistoryContent(input);
  if (!content.clientId || (!content.message && !content.images.length)) {
    throw new Error("Transcript entry is empty.");
  }
  const hash = ownerHash(key);
  const row = await db.companyVoiceTranscript.upsert({
    where: { ownerHash_clientId: { ownerHash: hash, clientId: content.clientId } },
    create: { ownerHash: hash, ...content },
    update: {
      role: content.role,
      message: content.message,
      images: content.images,
      agent: content.agent,
      occurredAt: content.occurredAt,
    },
  });
  await db.companyVoiceTranscript.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - ttl) } },
  }).catch(() => {});
  return toEntry(row);
}

/** Last N durable turns for this owner, oldest first. */
export async function readVoiceHistory(key: string): Promise<VoiceHistoryEntry[]> {
  const rows = await getAccountingDb().companyVoiceTranscript.findMany({
    where: {
      ownerHash: ownerHash(key),
      occurredAt: { gte: new Date(Date.now() - ttl) },
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return rows.reverse().map(toEntry);
}
