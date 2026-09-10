import { createHash } from "node:crypto";
import { getAccountingDb } from "@/lib/accounting/db";
import { namedVoiceAgent } from "./voice-agents";
import { voiceReplyContent, type BossReply, type BossReplyInput } from "./voice-inbox";

const ownerHash = (key: string) => createHash("sha256").update(key).digest("hex");
const ttl = 60 * 60 * 1000;

// Shared durable storage: webhook delivery and polling may run on different instances.
export async function addVoiceReply(key: string, input: BossReplyInput): Promise<BossReply> {
  const db = getAccountingDb();
  const row = await db.companyVoiceReply.create({ data: {
    ownerHash: ownerHash(key),
    ...voiceReplyContent(input),
  } });
  // Cleanup must not turn a successful delivery into an error and cause a retry.
  await db.companyVoiceReply.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - ttl) } } }).catch(() => {});
  return { id: row.id, timestamp: row.createdAt.getTime(), message: row.message, images: row.images, agent: namedVoiceAgent(row.agent ?? "") };
}

export async function readVoiceReplies(key: string, since: number): Promise<BossReply[]> {
  const rows = await getAccountingDb().companyVoiceReply.findMany({
    where: { ownerHash: ownerHash(key), createdAt: { gte: new Date(Math.max(since, Date.now() - ttl)) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({ id: row.id, timestamp: row.createdAt.getTime(), message: row.message, images: row.images, agent: namedVoiceAgent(row.agent ?? "") }));
}
