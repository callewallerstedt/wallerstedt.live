import { requireOwnerSession } from "@/lib/accounting/auth";
import {
  contentDisposition,
  getStoredDocument,
  readPrivateDocument,
} from "@/lib/accounting/documents";
import { privateStream, route } from "@/lib/accounting/http";
import { parseUuid } from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string; id: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey, id } = await params;
    await requireOwnerSession(request, accessKey);
    const document = await getStoredDocument(parseUuid(id));
    const blob = await readPrivateDocument(document);
    return privateStream(blob.stream, {
      status: 200,
      headers: {
        "Content-Type": document.mimeType ?? blob.blob.contentType,
        "Content-Length": String(document.byteSize ?? blob.blob.size),
        "Content-Disposition": contentDisposition(document.originalName, true),
      },
    });
  });
}
