import { z } from "zod";
import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { getAccountingDb } from "@/lib/accounting/db";
import { privateJson, route } from "@/lib/accounting/http";
import { serializeAuditEvent } from "@/lib/accounting/serialize";
import { parseWithSchema } from "@/lib/accounting/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ accessKey: string }> }) {
  return route(async () => {
    await requireAgentOrOwnerSession(request, (await params).accessKey);
    const query = parseWithSchema(z.object({
      after: z.string().regex(/^[0-9]{1,18}$/).default("0"),
      limit: z.coerce.number().int().min(1).max(250).default(100),
    }), Object.fromEntries(new URL(request.url).searchParams));
    const rows = await getAccountingDb().accountingAuditEvent.findMany({
      where: { id: { gt: BigInt(query.after) } }, orderBy: { id: "asc" }, take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    return privateJson({ ok: true, changes: page.map(serializeAuditEvent), nextCursor: page.at(-1)?.id.toString() ?? query.after, hasMore: rows.length > query.limit });
  });
}
