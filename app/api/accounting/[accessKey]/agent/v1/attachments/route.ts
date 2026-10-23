import { z } from "zod";

import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { filesFromForm, uploadDocuments } from "@/lib/accounting/documents";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { fileFromPublicUrl } from "@/lib/accounting/remote-document";
import { serializeDocument } from "@/lib/accounting/serialize";
import { getAccountingDb } from "@/lib/accounting/db";
import { parseUuid, parseWithSchema } from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const query = parseWithSchema(z.object({
      page: z.coerce.number().int().min(1).max(1_000_000).default(1),
      limit: z.coerce.number().int().min(1).max(250).default(100),
      entryId: z.string().uuid().optional(),
      unassigned: z.enum(["true", "false"]).optional(),
      q: z.string().max(200).optional(),
    }).refine((value) => !(value.entryId && value.unassigned === "true"), "entryId and unassigned=true conflict."), Object.fromEntries(new URL(request.url).searchParams));
    const where = {
      deletedAt: null,
      ...(query.entryId ? { entryId: query.entryId } : query.unassigned === "true" ? { entryId: null } : query.unassigned === "false" ? { entryId: { not: null } } : {}),
      ...(query.q ? { originalName: { contains: query.q, mode: "insensitive" as const } } : {}),
    };
    const db = getAccountingDb();
    const [rows, total] = await db.$transaction([
      db.accountingDocument.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit }),
      db.accountingDocument.count({ where }),
    ], { isolationLevel: "RepeatableRead" });
    return privateJson({ ok: true, documents: rows.map((row) => ({ ...serializeDocument(row), downloadUrl: row.blobPathname ? `/api/accounting/${encodeURIComponent(accessKey)}/agent/v1/attachments/${row.id}/download` : null })), total, page: query.page, limit: query.limit, hasMore: query.page * query.limit < total });
  });
}

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
