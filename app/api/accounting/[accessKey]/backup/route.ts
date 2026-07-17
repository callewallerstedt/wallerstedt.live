import { requireOwnerSession } from "@/lib/accounting/auth";
import { createAccountingBackup } from "@/lib/accounting/backup";
import { privateJson, route } from "@/lib/accounting/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ accessKey: string }> };

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    return privateJson({ ok: true, backup: await createAccountingBackup("owner") }, 201);
  });
}
