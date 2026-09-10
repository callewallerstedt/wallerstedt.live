import { assertAccessKey, requireOwnerSession, secretEqual } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { privateJson, route } from "@/lib/accounting/http";
import { voiceInbox } from "@/lib/os/voice-inbox";
import { bossReplySchema } from "@/lib/os/voice-validation";
import { voiceInput } from "@/lib/os/voice-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ accessKey: string }> };
export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    assertAccessKey(accessKey);
    const token = process.env.BOSS_VOICE_INBOX_TOKEN || process.env.BOSS_VOICE_WEBHOOK_TOKEN;
    if (!token || !secretEqual(request.headers.get("authorization") ?? "", `Bearer ${token}`)) throw new AccountingError("Unauthorized.", 401, "unauthorized");
    const item = voiceInbox.add(accessKey, await voiceInput(request, bossReplySchema));
    return privateJson({ ok: true, id: item.id }, 201);
  });
}
export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    const since = Number(new URL(request.url).searchParams.get("since") ?? 0);
    if (!Number.isFinite(since) || since < 0) throw new AccountingError("Invalid inbox cursor.", 400, "voice_validation_error");
    return privateJson({ items: voiceInbox.read(accessKey, since) });
  });
}
