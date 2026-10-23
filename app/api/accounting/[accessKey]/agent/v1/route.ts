import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const base = `/api/accounting/${encodeURIComponent(accessKey)}/agent/v1`;
    return privateJson({
      ok: true,
      name: "Wallerstedt accounting agent API",
      version: 1,
      revision: "1.1.0",
      authentication: {
        bearer: "Authorization: Bearer <ACCOUNTING_AGENT_API_TOKEN>",
        ownerSession: "The signed-in vault cookie is also accepted.",
      },
      endpoints: {
        posts: { list: `GET ${base}/entries`, create: `POST ${base}/entries` },
        post: { get: `GET ${base}/entries/{id}`, update: `PATCH ${base}/entries/{id}`, delete: `DELETE ${base}/entries/{id}`, history: `GET ${base}/entries/{id}/revisions` },
        accounts: { list: `GET ${base}/accounts`, create: `POST ${base}/accounts`, update: `PATCH ${base}/accounts/{id}`, delete: `DELETE ${base}/accounts/{id}` },
        balances: `GET ${base}/balances?accounts=1930,2893,1385`,
        attachments: `POST ${base}/attachments (multipart files or JSON URL)`,
        schema: `GET ${base}/schema`,
        documents: { list: `GET ${base}/attachments`, assign: `PATCH ${base}/attachments/{id}`, delete: `DELETE ${base}/attachments/{id}`, download: `GET ${base}/attachments/{id}/download` },
        changes: `GET ${base}/changes?after=0&limit=100`,
        reports: `GET ${base}/reports?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD (format=csv or includeJournal=true)`,
        reconcile: `POST ${base}/reconcile`,
        bank: { status: `GET ${base}/bank`, available: `GET ${base}/bank?banks=true`, connect: `POST ${base}/bank`, disconnect: `DELETE ${base}/bank`, balances: `GET ${base}/bank/accounts/{id}/balances`, transactions: `GET ${base}/bank/accounts/{id}/transactions?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD` },
        openapi: `GET ${base}/openapi`,
        guide: `GET ${base}/guide`,
      },
      guarantees: {
        money: "Two-decimal exact storage; balance fields are JSON numbers with exact string companions.",
        idempotency: "Prefer bankAccountId + bankTransactionId for distinct identical payments. Legacy fallback fingerprints bankText + date + amount. Bind historical rows with PATCH before using stable identities.",
        concurrency: "PATCH entries requires the current version and rejects stale updates with HTTP 409.",
      },
      limitations: ["No immutable journal numbering or fiscal-period locking yet.", "Reports do not file INK2/SRU, VAT returns or annual reports.", "Business-bank access requires provider availability and separate owner BankID consent; it does not make payments."],
    });
  });
}
