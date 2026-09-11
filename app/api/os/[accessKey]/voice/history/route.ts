import { requireOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { privateJson, route } from "@/lib/accounting/http";
import { readVoiceHistory, saveVoiceHistory } from "@/lib/os/voice-history-store";
import { voiceInput } from "@/lib/os/voice-server";
import { voiceHistorySchema } from "@/lib/os/voice-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ accessKey: string }> };

/** Owner-session only: load prior GPT-Live transcript turns. */
export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    return privateJson({ items: await readVoiceHistory(accessKey) });
  });
}

/** Owner-session only: persist a finalized Live transcript turn. */
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    try {
      const item = await saveVoiceHistory(accessKey, await voiceInput(request, voiceHistorySchema));
      return privateJson({ ok: true, id: item.id }, 201);
    } catch (error) {
      if (error instanceof Error && error.message === "Transcript entry is empty.") {
        throw new AccountingError("Transcript entry is empty.", 400, "voice_validation_error");
      }
      throw error;
    }
  });
}
