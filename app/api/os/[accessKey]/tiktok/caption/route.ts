import { z } from "zod";

import { requireOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import {
  CAPTION_PROMPT_MAX,
  generateTikTokCaption,
} from "@/lib/os/tiktok-caption";
import { getAccountingDb } from "@/lib/accounting/db";
import { getCaptionPrompt, saveCaptionPrompt } from "@/lib/os/tiktok-caption-store";
import { getTask } from "@/lib/os/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

const generateSchema = z.object({
  taskId: z.string().uuid(),
  prompt: z.string().max(CAPTION_PROMPT_MAX).optional(),
});

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    const parsed = generateSchema.safeParse(await parseJson(request, 8_000));
    if (!parsed.success) {
      throw new AccountingError("Could not generate a caption for that idea.", 400, "validation_error");
    }

    const task = await getTask(parsed.data.taskId);
    if (!task) throw new AccountingError("That video idea was not found.", 404, "not_found");
    if (task.list !== "video") {
      throw new AccountingError("Captions are only for video ideas.", 400, "not_a_video_idea");
    }

    const customPrompt =
      parsed.data.prompt !== undefined
        ? await saveCaptionPrompt(parsed.data.prompt)
        : await getCaptionPrompt();

    const result = await generateTikTokCaption(
      { title: task.title, song: task.song, notes: task.notes },
      customPrompt,
    );
    try {
      await getAccountingDb().companyTask.update({
        where: { id: task.id },
        data: { caption: result.caption },
      });
    } catch {
      // Still return the generated line if the caption column is not migrated yet.
    }
    return privateJson({ ok: true, caption: result.caption, model: result.model });
  });
}
