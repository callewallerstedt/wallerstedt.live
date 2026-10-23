import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import { privateJson, privateStream, route } from "@/lib/accounting/http";
import { reportPeriod } from "@/lib/accounting/query";
import { accountingReport, journalCsv } from "@/lib/accounting/reports";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ accessKey: string }> }) {
  return route(async () => {
    await requireAgentOrOwnerSession(request, (await params).accessKey);
    const query = new URL(request.url).searchParams;
    const period = reportPeriod(query);
    const format = query.get("format") ?? "json";
    if (!["json", "csv"].includes(format)) throw new AccountingError("format must be json or csv.", 400, "invalid_format");
    if (query.has("includeJournal") && !["true", "false"].includes(query.get("includeJournal")!)) throw new AccountingError("includeJournal must be true or false.", 400, "invalid_query");
    const report = await accountingReport(period, format === "csv" || query.get("includeJournal") === "true");
    if (format === "csv") return privateStream(journalCsv(report), { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="journal-${period.dateFrom}-${period.dateTo}.csv"`,
    } });
    return privateJson({ ok: true, ...report });
  });
}
