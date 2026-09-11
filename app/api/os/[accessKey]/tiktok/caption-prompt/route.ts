import { z } from "zod";

import { requireOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { getCaptionPrompt, saveCaptionPrompt } from "@/lib/os/tiktok-caption-store";
import { CAPTION_PROMPT_MAX } from "@/lib/os/tiktok-caption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

const patchSchema = z.object({
  prompt: z.string().max(CAPTION_PROMPT_MAX),
});

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    return privateJson({ ok: true, prompt: await getCaptionPrompt() });
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    const parsed = patchSchema.safeParse(await parseJson(request, 8_000));
    if (!parsed.success) {
      throw new AccountingError("Could not save those caption tips.", 400, "validation_error");
    }
    const prompt = await saveCaptionPrompt(parsed.data.prompt);
    return privateJson({ ok: true, prompt });
  });
}
