import { requireOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { agentMessageSchema } from "@/lib/os/voice-validation";
import { sendVoiceAgent, voiceInput } from "@/lib/os/voice-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ accessKey: string }> }) {
  return route(async () => {
    await requireOwnerSession(request, (await params).accessKey, true);
    const input = await voiceInput(request, agentMessageSchema);
    return privateJson(await sendVoiceAgent(input.message, input.agent));
  });
}
