import { requireOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { bossPayload } from "@/lib/os/voice-inbox";
import { bossMessageSchema } from "@/lib/os/voice-validation";
import { voiceFetch, voiceInput } from "@/lib/os/voice-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ accessKey: string }> }) {
  return route(async () => {
    await requireOwnerSession(request, (await params).accessKey, true);
    const input = await voiceInput(request, bossMessageSchema);
    const url = process.env.BOSS_VOICE_WEBHOOK_URL;
    const token = process.env.BOSS_VOICE_WEBHOOK_TOKEN;
    if (!url || !token) return privateJson({ ok: false, message: "Elon voice webhook is not configured." }, 503);
    const response = await voiceFetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(bossPayload(input.message)) });
    if (!response?.ok) return privateJson({ ok: false, message: "Elon did not accept the message." }, 502);
    return privateJson({ ok: true });
  });
}
