import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { filesFromForm, uploadDocuments } from "@/lib/accounting/documents";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { fileFromPublicUrl } from "@/lib/accounting/remote-document";
import { serializeDocument } from "@/lib/accounting/serialize";
import { parseUuid, parseWithSchema } from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

const urlAttachmentSchema = z.object({
  url: z.string().trim().url().max(2_000),
  filename: z.string().trim().min(1).max(180).optional().nullable(),
  entryId: z.string().uuid().optional().nullable(),
});

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey, true);
    const contentType = request.headers.get("content-type")?.toLocaleLowerCase("en") ?? "";
    let files: File[];
    let entryId: string | null;

    if (contentType.includes("application/json")) {
      const input = parseWithSchema(urlAttachmentSchema, await parseJson(request, 32_000));
      files = [await fileFromPublicUrl(input.url, input.filename)];
      entryId = input.entryId ?? null;
    } else {
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        throw new AccountingError("Invalid multipart form.", 400, "invalid_form");
      }
      files = filesFromForm(form);
      const rawEntryId = form.get("entryId");
      entryId = typeof rawEntryId === "string" && rawEntryId.trim()
        ? parseUuid(rawEntryId.trim())
        : null;
    }

    const documents = await uploadDocuments(files, entryId, "agent-api");
    return privateJson({
      ok: true,
      documents: documents.map(serializeDocument),
      attachedToEntryId: entryId,
    }, 201);
  });
}
