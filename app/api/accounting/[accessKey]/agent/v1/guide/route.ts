import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateStream, route } from "@/lib/accounting/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ accessKey: string }> }) {
  return route(async () => {
    await requireAgentOrOwnerSession(request, (await params).accessKey);
    const guide = await readFile(path.join(process.cwd(), "public", "GROKBOT_ACCOUNTING_GUIDE.md"), "utf8");
    return privateStream(guide, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'attachment; filename="GROKBOT_ACCOUNTING_GUIDE.md"' } });
  });
}
