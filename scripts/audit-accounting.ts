/** Read-only live audit. Pass --env-file before --import tsx; never prints credentials. */
import { writeFile, mkdir } from "node:fs/promises";
import { getAccountingDb } from "../lib/accounting/db";
import { accountingReport } from "../lib/accounting/reports";

async function main() {
try {
  const report = await accountingReport({ dateFrom: "1900-01-01", dateTo: "9999-12-31" });
  const summary = {
    auditedAt: report.generatedAt, scope: "All recorded history, not a registered fiscal year or a declaration signoff",
    entryCount: report.entryCount, undatedEntries: report.undatedEntries,
    trialBalanceDifference: report.trialBalance.difference,
    errorCount: report.readiness.errorCount, warningCount: report.readiness.warningCount,
    findings: report.readiness.findingCounts, pendingDrafts: report.pendingDrafts, latestBackup: report.latestBackup,
  };
  await mkdir("private-data", { recursive: true });
  await writeFile("private-data/accounting-audit.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
} catch {
  console.error("Read-only accounting audit failed. No source data or credentials printed; no ledger writes performed.");
  process.exitCode = 1;
} finally {
  await getAccountingDb().$disconnect();
}
}
void main();
