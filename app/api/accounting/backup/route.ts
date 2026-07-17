import { secretEqual } from "@/lib/accounting/auth";
import { createAccountingBackup } from "@/lib/accounting/backup";
import { AccountingError } from "@/lib/accounting/errors";
import { privateJson, route } from "@/lib/accounting/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function requireCron(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  const supplied = request.headers.get("authorization") ?? "";
  if (secret.length < 32 || !secretEqual(supplied, `Bearer ${secret}`)) {
    throw new AccountingError("Unauthorized.", 401, "unauthorized");
  }
}

export async function GET(request: Request) {
  return route(async () => {
    requireCron(request);
    const backup = await createAccountingBackup("vercel-cron");
    return privateJson({ ok: true, backup });
  });
}
