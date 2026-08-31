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
      authentication: {
        bearer: "Authorization: Bearer <ACCOUNTING_AGENT_API_TOKEN>",
        ownerSession: "The signed-in vault cookie is also accepted.",
      },
      endpoints: {
        posts: { list: `GET ${base}/entries`, create: `POST ${base}/entries` },
        post: { get: `GET ${base}/entries/{id}`, update: `PATCH ${base}/entries/{id}` },
        balances: `GET ${base}/balances?accounts=1930,2893,1385`,
        attachments: `POST ${base}/attachments (multipart files or JSON URL)`,
        schema: `GET ${base}/schema`,
      },
      guarantees: {
        money: "Two-decimal exact storage; balance fields are JSON numbers with exact string companions.",
        idempotency: "POST entries fingerprints normalized bankText + date + amount and returns an existing post on retry.",
        concurrency: "PATCH entries requires the current version and rejects stale updates with HTTP 409.",
      },
    });
  });
}
