import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { TASK_AREAS } from "@/lib/os/task-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    const base = `/api/os/${encodeURIComponent(accessKey)}/agent/v1`;
    return privateJson({
      ok: true,
      name: "Wallerstedt company task API",
      version: 1,
      authentication: {
        bearer: "Authorization: Bearer <ACCOUNTING_AGENT_API_TOKEN>",
        ownerSession: "The signed-in dashboard cookie is also accepted.",
      },
      endpoints: {
        tasks: {
          list: `GET ${base}/tasks?status=open|done|all&area=<area>`,
          create: `POST ${base}/tasks`,
          reorder: `PATCH ${base}/tasks  { "ids": [...] }`,
        },
        task: {
          get: `GET ${base}/tasks/{id}`,
          update: `PATCH ${base}/tasks/{id}`,
          remove: `DELETE ${base}/tasks/{id}`,
        },
      },
      fields: {
        title: "string, 1-300 characters, required on create",
        notes: "string, up to 4000 characters — the long description",
        area: TASK_AREAS,
        priority: ["low", "normal", "high"],
        dueDate: "YYYY-MM-DD or null",
        done: "boolean, PATCH only",
        archived: "boolean, PATCH only — hides the task from the active list",
      },
      guarantees: {
        idempotency:
          "POST returns the existing open task when its title already matches, so a retry never duplicates a row.",
        scope: "Tasks are separate from bokföring. Writing one never touches the ledger.",
        ordering:
          "The list order is the priority order; the first three are what the dashboard shows as Focus. PATCH /tasks with a partial id list moves exactly those to the top, in that order, and leaves the rest alone.",
      },
    });
  });
}
