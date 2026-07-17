import { z } from "zod";
import { requireOwnerSession } from "@/lib/accounting/auth";
import {
  filesFromForm,
  listDocuments,
  uploadDocuments,
} from "@/lib/accounting/documents";
import { AccountingError } from "@/lib/accounting/errors";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { serializeDocument } from "@/lib/accounting/serialize";
import { finalizeClientDocument } from "@/lib/accounting/uploads";
import { parseUuid, parseWithSchema } from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

const finalizeSchema = z.object({
  entryId: z.string().uuid().optional().nullable(),
  originalName: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(1).max(100),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  blob: z.object({
    pathname: z.string().min(1).max(240),
    url: z.string().url().max(1_000),
    downloadUrl: z.string().url().max(1_200).optional().nullable(),
    etag: z.string().max(300).optional().nullable(),
  }),
});

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    const rawEntryId = new URL(request.url).searchParams.get("entryId");
    const entryId = rawEntryId ? parseUuid(rawEntryId) : null;
    return privateJson({ ok: true, documents: await listDocuments(entryId) });
  });
}

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    const contentType = request.headers.get("content-type")?.toLocaleLowerCase("en") ?? "";
    if (contentType.includes("application/json")) {
      const input = parseWithSchema(finalizeSchema, await parseJson(request, 128_000));
      const document = await finalizeClientDocument(
        {
          pathname: input.blob.pathname,
          url: input.blob.url,
          downloadUrl: input.blob.downloadUrl,
          etag: input.blob.etag,
          name: input.originalName,
          mimeType: input.mimeType,
          size: input.byteSize,
          sha256: input.sha256,
        },
        input.entryId ?? null,
      );
      return privateJson({ ok: true, document: serializeDocument(document) }, 201);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AccountingError("Invalid multipart form.", 400, "invalid_form");
    }
    const rawEntryId = form.get("entryId");
    const entryId =
      typeof rawEntryId === "string" && rawEntryId.trim()
        ? parseUuid(rawEntryId.trim())
        : null;
    const documents = await uploadDocuments(filesFromForm(form), entryId);
    return privateJson(
      { ok: true, documents: documents.map(serializeDocument), document: serializeDocument(documents[0]) },
      201,
    );
  });
}
