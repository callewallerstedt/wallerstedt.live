import { completeBusinessBankConnection } from "@/lib/accounting/bank";
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
    } catch {
      // Never reflect upstream error strings, callback codes, states or account identifiers.
    }
  }
  return privateStream(`<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Företagsbank</title><body><h1>Företagsbank</h1><p>${message}</p></body></html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'", "X-Frame-Options": "DENY" },
  });
}
