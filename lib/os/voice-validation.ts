import { z } from "zod";
import { VOICE_HISTORY_ROLES } from "./voice-history";

export const bossMessageSchema = z.object({ message: z.string().trim().min(1).max(8000) });
export const agentMessageSchema = bossMessageSchema.extend({ agent: z.string().trim().min(1).max(100) });
const imageUrl = z.string().max(2048).url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Images must use HTTPS.");
export const bossReplySchema = z.object({
  message: z.string().max(8000).optional(),
  text: z.string().max(8000).optional(),
  images: z.array(imageUrl).max(12).optional(),
  imageUrls: z.array(imageUrl).max(12).optional(),
  agent: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
}).refine((value) => Boolean(value.message?.trim() || value.text?.trim() || value.images?.length || value.imageUrls?.length), "Reply is empty.");

export const voiceHistorySchema = z.object({
  clientId: z.string().trim().min(1).max(200),
  role: z.enum(VOICE_HISTORY_ROLES),
  message: z.string().max(8000).optional(),
  text: z.string().max(8000).optional(),
  images: z.array(imageUrl).max(12).optional(),
  agent: z.string().max(100).optional(),
  occurredAt: z.number().finite().nonnegative().optional(),
}).refine((value) => Boolean(value.message?.trim() || value.text?.trim() || value.images?.length), "Transcript entry is empty.");
