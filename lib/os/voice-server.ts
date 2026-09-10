import { z } from "zod";
import { AccountingError } from "@/lib/accounting/errors";
import { parseOptionalJson } from "@/lib/accounting/http";
import { agentWebhookPayload, normalizeVoiceAgent, resolveVoiceAgent } from "@/lib/os/voice-agents";

export async function sendVoiceAgent(message: string, name: string) {
  const slug = normalizeVoiceAgent(name);
  if (!slug) throw new AccountingError("Unknown voice agent.", 400, "voice_validation_error");
  const label = slug[0].toUpperCase() + slug.slice(1);
  const agent = resolveVoiceAgent(slug);
  if (!agent) throw new AccountingError(`${label} voice webhook is not configured.`, 503, "voice_agent_unavailable");
  const response = await voiceFetch(agent.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${agent.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(agentWebhookPayload(message, agent.agent)),
  });
  if (!response?.ok) throw new AccountingError(`${label} did not accept the message.`, 502, "voice_agent_delivery_failed");
  return { ok: true, agent: agent.agent };
}

export async function voiceInput<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.output<T>> {
  const result = schema.safeParse(await parseOptionalJson(request, 64_000));
  if (!result.success) throw new AccountingError("Invalid voice request.", 400, "voice_validation_error");
  return result.data;
}
export async function voiceFetch(url: string, init: RequestInit) {
  try {
    return await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
  } catch {
    return null;
  }
}
