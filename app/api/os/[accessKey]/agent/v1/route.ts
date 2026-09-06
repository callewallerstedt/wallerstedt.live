import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";
import { TASK_AREAS } from "@/lib/os/task-meta";
import { TIKTOK_SEED_HANDLES } from "@/lib/os/tiktok-scan";

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
      name: "Wallerstedt company OS agent API",
      version: 1,
      authentication: {
        bearer: "Authorization: Bearer <ACCOUNTING_AGENT_API_TOKEN>",
        ownerSession: "The signed-in dashboard cookie is also accepted.",
      },
      endpoints: {
        tasks: {
          list: `GET ${base}/tasks?status=open|done|all&area=<area>&list=task|video&archived=1`,
          create: `POST ${base}/tasks`,
          reorder: `PATCH ${base}/tasks  { "ids": [...], "list": "task"|"video" }  (list defaults to task)`,
        },
        task: {
          get: `GET ${base}/tasks/{id}`,
          update: `PATCH ${base}/tasks/{id}`,
          remove: `DELETE ${base}/tasks/{id}`,
        },
        tiktokWatch: {
          list: `GET ${base}/tiktok/watch`,
          add: `POST ${base}/tiktok/watch  { "handle": "tonyannn" }`,
          remove: `DELETE ${base}/tiktok/watch/{id|handle}`,
          scan: `POST ${base}/tiktok/watch/scan  {} | { "handle" } | { "accountId" } | { "scanId" }`,
          scans: `GET ${base}/tiktok/watch/scans`,
        },
      },
      fields: {
        title: "string, 1-300 characters, required on create",
        list: [
          "task — the to-do list",
          "video — TikTok video ideas, shown under the to-dos",
        ],
        song: "string — the track a video idea uses; the dashboard turns it into Spotify / YouTube / TikTok searches",
        notes: "string, up to 4000 characters — the long description",
        area: TASK_AREAS,
        priority: ["low", "normal", "high"],
        dueDate: "YYYY-MM-DD or null",
        done: "boolean, PATCH only",
        archived:
          "boolean, PATCH only — hides the task from the active list (dashboard Past). GET /tasks omits these unless archived=1",
        handle:
          "TikTok username without or with @ — tonyannn and @tonyannn both work. Also accepts a profile URL. Normalized to lowercase.",
        account: {
          id: "uuid",
          handle: "normalized unique_id",
          uniqueId: "TikTok unique_id after a scan, else the handle",
          nickname: "display name after a scan",
          sortOrder: "int",
        },
        lastScan: {
          scannedAt: "ISO timestamp",
          weekKey: "Berlin ISO week, e.g. 2026-W36",
          routine: "weekly-piano-tiktok-watch",
          accounts: "per-handle scan status (followers, videoCount, error)",
          allTime: "ranked videos from the latest Treg posts",
          last7: "videos from the last 7 days, ranked by views then likes",
          last30: "videos from the last 30 days, ranked by views then likes",
          trending: "optional Treg piano-cover strip",
          video: {
            awemeId: "string",
            uniqueId: "string",
            handle: "string",
            desc: "caption",
            song: "guess from caption, or null",
            playCount: "number or null",
            diggCount: "number or null",
            coverUrl: "https thumbnail or null",
            url: "https://www.tiktok.com/@{unique_id}/video/{aweme_id}",
            createTimeMs: "number or null",
          },
        },
        scan: {
          scanId: "uuid of the CompanyTikTokScan job / result row",
          status: "started | running | done | failed",
          processed: "accounts finished so far",
          total: "watched accounts in this job",
          nextHandle: "next pending handle, or null",
          next: '{ "handle", "accountId" } or null — cursor for the next burst',
          error: "string or null",
        },
      },
      guarantees: {
        idempotency:
          "POST /tasks returns the existing open task when its title already matches, so a retry never duplicates a row. POST /tiktok/watch returns the current list when the handle is already watched.",
        scope: "Tasks and TikTok watches are separate from bokföring. Writing one never touches the ledger.",
        ordering:
          "Each list is ordered independently, open rows first, then the owner's sort. GET /tasks?list=video returns only active video ideas in that order — not Past/archived ones. PATCH /tasks with a partial id list moves exactly those to the top, in that order, and leaves the rest alone.",
        tiktokSeeds: `First load (and later list calls) ensure these watched handles exist: ${TIKTOK_SEED_HANDLES.join(", ")}.`,
        tiktokScan:
          "POST /tiktok/watch/scan starts an async job and returns immediately with { ok, status: started|running|done|failed, scanId, processed, total, next, scan, lastScan }. Background bursts scan one account per invocation (under Vercel's time limit), persist progress on CompanyTikTokScan, and finish by writing the ranked lastScan. Poll GET /tiktok/watch or GET /tiktok/watch/scans for scan.status and lastScan. POST { handle } or { accountId } processes that one watched account as a burst. POST { scanId } resumes the next burst if the chain stalled. GET also nudges an open job.",
      },
    });
  });
}
