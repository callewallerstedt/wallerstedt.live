import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { get } from "@vercel/blob";
import type { Prisma } from "@prisma/client";

import { getAccountingDb } from "../lib/accounting/db";

try {
  process.loadEnvFile(resolve(process.cwd(), ".env.local"));
} catch {
  // Explicit process environment remains supported in recovery shells.
}

type JsonRecord = Record<string, unknown>;

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function records(value: unknown, label: string): JsonRecord[] {
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new Error(`Backup field ${label} is not a record array.`);
  }
  return value as JsonRecord[];
}

function date(value: unknown, label: string) {
  const parsed = new Date(String(value ?? ""));
  if (Number.isNaN(parsed.getTime())) throw new Error(`Backup date ${label} is invalid.`);
  return parsed;
}

function optionalDate(value: unknown, label: string) {
  return value === null || value === undefined ? null : date(value, label);
}

function bigint(value: unknown, label: string) {
  try {
    return BigInt(String(value));
  } catch {
    throw new Error(`Backup integer ${label} is invalid.`);
  }
}

async function privateBytes(pathname: string) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Private Blob object is unavailable: ${pathname}`);
  }
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

async function verifyDocumentBlobs(documents: JsonRecord[], concurrency = 4) {
  const stored = documents.filter((document) => document.storageStatus === "stored");
  let next = 0;
  async function worker() {
    for (;;) {
      const document = stored[next++];
      if (!document) return;
      const pathname = String(document.blobPathname ?? "");
      const expectedHash = String(document.sha256 ?? "").toLowerCase();
      const expectedSize = Number(document.byteSize);
      if (!pathname || !/^[a-f0-9]{64}$/.test(expectedHash) || !Number.isSafeInteger(expectedSize)) {
        throw new Error(`Stored document ${String(document.id)} has incomplete verification metadata.`);
      }
      const bytes = await privateBytes(pathname);
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== expectedSize || actualHash !== expectedHash) {
        throw new Error(`Stored document ${String(document.id)} failed checksum verification.`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, stored.length)) }, () => worker()),
  );
}

function verifyReferences(data: Record<string, JsonRecord[]>) {
  const entryIds = new Set(data.entries.map((item) => String(item.id)));
  for (const document of data.documents) {
    if (document.entryId && !entryIds.has(String(document.entryId))) {
      throw new Error(`Document ${String(document.id)} references a missing entry.`);
    }
  }
  for (const revision of data.revisions) {
    if (!entryIds.has(String(revision.entryId))) {
      throw new Error(`Revision ${String(revision.id)} references a missing entry.`);
    }
  }
  for (const draft of data.aiDrafts) {
    if (draft.entryId && !entryIds.has(String(draft.entryId))) {
      throw new Error(`AI draft ${String(draft.id)} references a missing entry.`);
    }
  }
}

function cents(value: unknown) {
  const normalized = String(value ?? "0").replace(",", ".");
  const [whole, fraction = ""] = normalized.split(".");
  const sign = whole.startsWith("-") ? BigInt(-1) : BigInt(1);
  return sign * (BigInt(whole.replace("-", "")) * BigInt(100) + BigInt((fraction + "00").slice(0, 2)));
}

function idManifest(values: unknown[]) {
  return createHash("sha256")
    .update(values.map(String).sort().join("\n"), "utf8")
    .digest("hex");
}

async function main() {
  const pathname = argument("--pathname");
  const expectedSha256 = argument("--sha256")?.toLowerCase();
  const shouldRestore = process.argv.includes("--restore-to-empty-database");
  const confirmed = process.argv.includes("--confirm-empty-target");
  if (!pathname || !pathname.startsWith("accounting-backups/snapshots/")) {
    throw new Error("Pass a private snapshot pathname with --pathname.");
  }
  if (expectedSha256 && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new Error("--sha256 must be a complete 64-character SHA-256 checksum.");
  }
  if (shouldRestore && (!confirmed || !expectedSha256)) {
    throw new Error("A write restore requires --confirm-empty-target and the full --sha256 value.");
  }

  const snapshotBytes = await privateBytes(pathname);
  const snapshotSha256 = createHash("sha256").update(snapshotBytes).digest("hex");
  if (expectedSha256 && snapshotSha256 !== expectedSha256) {
    throw new Error("Snapshot checksum does not match --sha256.");
  }
  const parsed = JSON.parse(snapshotBytes.toString("utf8")) as JsonRecord;
  if (parsed.format !== "wallerstedt-accounting-backup" || parsed.version !== 1) {
    throw new Error("Unsupported accounting backup format or version.");
  }
  const rawData = parsed.data;
  const rawCounts = parsed.counts;
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
    throw new Error("Backup data section is missing.");
  }
  if (!rawCounts || typeof rawCounts !== "object" || Array.isArray(rawCounts)) {
    throw new Error("Backup count section is missing.");
  }
  const source = rawData as JsonRecord;
  const counts = rawCounts as JsonRecord;
  const data = {
    accounts: records(source.accounts, "accounts"),
    entries: records(source.entries, "entries"),
    documents: records(source.documents, "documents"),
    revisions: records(source.revisions, "revisions"),
    auditEvents: records(source.auditEvents, "auditEvents"),
    aiDrafts: records(source.aiDrafts, "aiDrafts"),
    syncDevices: records(source.syncDevices, "syncDevices"),
    syncOperations: records(source.syncOperations, "syncOperations"),
  };
  for (const [key, items] of Object.entries(data)) {
    if (Number(counts[key]) !== items.length) {
      throw new Error(`Backup count for ${key} differs from its data array.`);
    }
  }
  verifyReferences(data);
  await verifyDocumentBlobs(data.documents);
  const expectedTotal = data.entries.reduce((sum, entry) => sum + cents(entry.amount), BigInt(0));
  console.log(
    `Verified snapshot ${snapshotSha256}: ${data.entries.length} entries, ` +
      `${data.documents.length} documents, total cents ${expectedTotal}.`,
  );
  if (!shouldRestore) {
    console.log("Verification-only mode complete; no database rows were changed.");
    return;
  }

  const db = getAccountingDb();
  const existing = await Promise.all([
    db.accountingAccount.count(),
    db.accountingEntry.count(),
    db.accountingDocument.count(),
    db.accountingEntryRevision.count(),
    db.accountingAuditEvent.count(),
    db.accountingAiDraft.count(),
    db.accountingSyncDevice.count(),
    db.accountingSyncOperation.count(),
    db.accountingBackup.count(),
    db.accountingLoginThrottle.count(),
    db.accountingOwnerSession.count(),
  ]);
  if (existing.some((count) => count !== 0)) {
    throw new Error("Restore target is not empty; no rows were changed.");
  }

  await db.$transaction(async (tx) => {
    if (data.accounts.length) {
      await tx.accountingAccount.createMany({
        data: data.accounts.map((item) => ({
          ...item,
          deletedAt: optionalDate(item.deletedAt, "account.deletedAt"),
          createdAt: date(item.createdAt, "account.createdAt"),
          updatedAt: date(item.updatedAt, "account.updatedAt"),
        })) as Prisma.AccountingAccountCreateManyInput[],
      });
    }
    if (data.entries.length) {
      await tx.accountingEntry.createMany({
        data: data.entries.map((item) => ({
          ...item,
          date: optionalDate(item.date, "entry.date"),
          deletedAt: optionalDate(item.deletedAt, "entry.deletedAt"),
          createdAt: date(item.createdAt, "entry.createdAt"),
          updatedAt: date(item.updatedAt, "entry.updatedAt"),
        })) as Prisma.AccountingEntryCreateManyInput[],
      });
    }
    if (data.documents.length) {
      await tx.accountingDocument.createMany({
        data: data.documents.map((item) => ({
          ...item,
          deletedAt: optionalDate(item.deletedAt, "document.deletedAt"),
          createdAt: date(item.createdAt, "document.createdAt"),
          updatedAt: date(item.updatedAt, "document.updatedAt"),
        })) as Prisma.AccountingDocumentCreateManyInput[],
      });
    }
    if (data.revisions.length) {
      await tx.accountingEntryRevision.createMany({
        data: data.revisions.map((item) => ({
          ...item,
          createdAt: date(item.createdAt, "revision.createdAt"),
        })) as Prisma.AccountingEntryRevisionCreateManyInput[],
      });
    }
    if (data.auditEvents.length) {
      await tx.accountingAuditEvent.createMany({
        data: data.auditEvents.map((item) => ({
          ...item,
          id: bigint(item.id, "auditEvent.id"),
          createdAt: date(item.createdAt, "auditEvent.createdAt"),
        })) as Prisma.AccountingAuditEventCreateManyInput[],
      });
    }
    if (data.aiDrafts.length) {
      await tx.accountingAiDraft.createMany({
        data: data.aiDrafts.map((item) => ({
          ...item,
          approvedAt: optionalDate(item.approvedAt, "aiDraft.approvedAt"),
          rejectedAt: optionalDate(item.rejectedAt, "aiDraft.rejectedAt"),
          createdAt: date(item.createdAt, "aiDraft.createdAt"),
          updatedAt: date(item.updatedAt, "aiDraft.updatedAt"),
        })) as Prisma.AccountingAiDraftCreateManyInput[],
      });
    }
    if (data.syncDevices.length) {
      await tx.accountingSyncDevice.createMany({
        data: data.syncDevices.map((item) => ({
          ...item,
          lastCursor: item.lastCursor === null || item.lastCursor === undefined
            ? null
            : bigint(item.lastCursor, "syncDevice.lastCursor"),
          lastSeenAt: date(item.lastSeenAt, "syncDevice.lastSeenAt"),
          createdAt: date(item.createdAt, "syncDevice.createdAt"),
          updatedAt: date(item.updatedAt, "syncDevice.updatedAt"),
        })) as Prisma.AccountingSyncDeviceCreateManyInput[],
      });
    }
    if (data.syncOperations.length) {
      await tx.accountingSyncOperation.createMany({
        data: data.syncOperations.map((item) => ({
          ...item,
          createdAt: date(item.createdAt, "syncOperation.createdAt"),
        })) as Prisma.AccountingSyncOperationCreateManyInput[],
      });
    }
    await tx.$queryRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"AccountingAuditEvent"', 'id'), ` +
        `COALESCE((SELECT MAX(id) FROM "AccountingAuditEvent"), 1), ` +
        `EXISTS(SELECT 1 FROM "AccountingAuditEvent"))`,
    );
    await tx.accountingBackup.create({
      data: {
        kind: "restored-json-snapshot",
        blobPathname: pathname,
        sha256: snapshotSha256,
        byteSize: snapshotBytes.byteLength,
        entryCount: data.entries.filter((entry) => !entry.deletedAt).length,
        documentCount: data.documents.filter((document) => !document.deletedAt).length,
        status: "verified",
        createdBy: "restore-tool",
      },
    });
  }, { maxWait: 10_000, timeout: 120_000, isolationLevel: "Serializable" });

  const [
    restoredAccounts,
    restoredEntries,
    restoredDocuments,
    restoredRevisions,
    restoredAuditEvents,
    restoredAiDrafts,
    restoredSyncDevices,
    restoredSyncOperations,
  ] = await Promise.all([
    db.accountingAccount.findMany({ select: { id: true } }),
    db.accountingEntry.findMany({ select: { id: true, amount: true } }),
    db.accountingDocument.findMany({ select: { id: true } }),
    db.accountingEntryRevision.findMany({ select: { id: true } }),
    db.accountingAuditEvent.findMany({ select: { id: true } }),
    db.accountingAiDraft.findMany({ select: { id: true } }),
    db.accountingSyncDevice.findMany({ select: { id: true } }),
    db.accountingSyncOperation.findMany({ select: { id: true } }),
  ]);
  const restoredTotal = restoredEntries.reduce(
    (sum, entry) => sum + cents(entry.amount.toFixed(2)),
    BigInt(0),
  );
  const restoredSets = [
    ["accounts", data.accounts, restoredAccounts],
    ["entries", data.entries, restoredEntries],
    ["documents", data.documents, restoredDocuments],
    ["revisions", data.revisions, restoredRevisions],
    ["auditEvents", data.auditEvents, restoredAuditEvents],
    ["aiDrafts", data.aiDrafts, restoredAiDrafts],
    ["syncDevices", data.syncDevices, restoredSyncDevices],
    ["syncOperations", data.syncOperations, restoredSyncOperations],
  ] as const;
  const identityMismatch = restoredSets.some(
    ([_label, expected, actual]) =>
      expected.length !== actual.length ||
      idManifest(expected.map((item) => item.id)) !== idManifest(actual.map((item) => item.id)),
  );
  if (identityMismatch || restoredTotal !== expectedTotal) {
    throw new Error("Post-restore reconciliation failed.");
  }
  console.log("Restore completed and reconciled against the verified snapshot.");
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Accounting restore failed.");
  process.exitCode = 1;
});
