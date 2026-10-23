import { completeBusinessBankConnection, completionDiagnostic } from "@/lib/accounting/bank";
import { AccountingError } from "@/lib/accounting/errors";
import { privateStream } from "@/lib/accounting/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  let message = "Bankkopplingen kunde inte slutföras. Starta igen från Agent vault.";
  let status = 400;
  if (!query.has("error") && query.get("code") && query.get("state")) {
    try {
      await completeBusinessBankConnection(query.get("code")!, query.get("state")!, {
        ip: request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim(),
        userAgent: request.headers.get("user-agent") ?? undefined,
      });
      message = "Företagsbanken är ansluten. Stäng den här fliken och uppdatera bankstatus i Agent vault.";
      status = 200;
    } catch (error) {
      const detail = error instanceof AccountingError && error.code === "business_bank_completion_failed"
        ? error.details as { stage: string; reason: string } : completionDiagnostic(error);
      const stage = /^[a-z_]{1,30}$/.test(detail.stage) ? detail.stage : "callback";
      const reason = /^[a-zA-Z0-9_\-]{1,80}$/.test(detail.reason) ? detail.reason : "internal_error";
      console.error("Business bank callback failed", { stage, reason });
      message = `Bankkopplingen kunde inte slutföras. Felreferens: ${stage}/${reason}. Återkoppla felreferensen så kan orsaken kontrolleras innan du försöker igen.`;
      status = error instanceof AccountingError ? error.status : 502;
    }
  }
  return privateStream(`<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Företagsbank</title><body><h1>Företagsbank</h1><p>${message}</p></body></html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'", "X-Frame-Options": "DENY" },
  });
}
