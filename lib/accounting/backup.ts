import { createHash } from "node:crypto";

import { del, get, head, list, put } from "@vercel/blob";

import { getAccountingDb } from "./db";

const SNAPSHOT_PREFIX = "accounting-backups/snapshots/";
const DAILY_RETENTION_DAYS = 35;

function backupJson(value: unknown) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (item && typeof item === "object" && "toFixed" in item) {
      const decimal = item as { toFixed?: (digits?: number) => string };
      if (typeof decimal.toFixed === "function") return decimal.toFixed(2);
    }
    return item;
  });
}

function safeTimestamp(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function readPrivateBlob(pathname: string) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Private backup blob is unavailable: ${pathname}`);
  }
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

async function verifyBlob(pathname: string, byteSize: number, sha256: string) {
  const metadata = await head(pathname);
  if (metadata.pathname !== pathname || metadata.size !== byteSize) {
    throw new Error(`Private backup blob metadata differs: ${pathname}`);
  }
  const bytes = await readPrivateBlob(pathname);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== byteSize || actualSha256 !== sha256.toLocaleLowerCase("en")) {
    throw new Error(`Private backup blob checksum differs: ${pathname}`);
  }
}

async function verifyDocumentBlobs(
  documents: Array<{
    id: string;
    storageStatus: string;
    blobPathname: string | null;
    sha256: string | null;
    byteSize: number | null;
  }>,
  concurrency = 4,
) {
  const stored = documents.filter((document) => document.storageStatus === "stored");
  let nextIndex = 0;
  async function worker() {
    for (;;) {
      const index = nextIndex++;
      const document = stored[index];
      if (!document) return;
      if (!document.blobPathname || !document.sha256 || document.byteSize === null) {
        throw new Error(`Stored document metadata is incomplete: ${document.id}`);
      }
      await verifyBlob(
        document.blobPathname,
        document.byteSize,
        document.sha256.toLocaleLowerCase("en"),
      );
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, stored.length)) }, () => worker()),
  );
}

/**
 * Retain every recent daily snapshot plus one older snapshot per month and year.
 * Document blobs are immutable and are never pruned here.
 */
async function pruneSnapshots(now: Date) {
  const { blobs } = await list({ prefix: SNAPSHOT_PREFIX, limit: 1000 });
  const ordered = [...blobs].sort(
    (left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime(),
  );
  const cutoff = now.getTime() - DAILY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const keptMonths = new Set<string>();
  const keptYears = new Set<string>();
  const remove: string[] = [];

  for (const blob of ordered) {
    const uploaded = blob.uploadedAt;
    if (uploaded.getTime() >= cutoff) continue;

    const month = uploaded.toISOString().slice(0, 7);
    const year = uploaded.toISOString().slice(0, 4);
    if (!keptMonths.has(month)) {
      keptMonths.add(month);
      keptYears.add(year);
      continue;
    }
    if (!keptYears.has(year)) {
      keptYears.add(year);
      continue;
    }
    remove.push(blob.url);
  }

  if (remove.length > 0) await del(remove);
  return remove.length;
}

export async function createAccountingBackup(createdBy = "cron") {
  const db = getAccountingDb();
  const createdAt = new Date();
  const [
    accounts,
    entries,
    documents,
    revisions,
    auditEvents,
    aiDrafts,
    syncDevices,
    syncOperations,
  ] = await db.$transaction(
    (tx) =>
      Promise.all([
        tx.accountingAccount.findMany({ orderBy: { account: "asc" } }),
        tx.accountingEntry.findMany({
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        }),
        tx.accountingDocument.findMany({ orderBy: { createdAt: "asc" } }),
        tx.accountingEntryRevision.findMany({ orderBy: { createdAt: "asc" } }),
        tx.accountingAuditEvent.findMany({ orderBy: { id: "asc" } }),
        tx.accountingAiDraft.findMany({ orderBy: { createdAt: "asc" } }),
        tx.accountingSyncDevice.findMany({ orderBy: { createdAt: "asc" } }),
        tx.accountingSyncOperation.findMany({ orderBy: { createdAt: "asc" } }),
      ]),
    {
      isolationLevel: "RepeatableRead",
      maxWait: 10_000,
      timeout: 120_000,
    },
  );

  const snapshot = {
    format: "wallerstedt-accounting-backup",
    version: 1,
    createdAt: createdAt.toISOString(),
    counts: {
      accounts: accounts.length,
      entries: entries.length,
      documents: documents.length,
      revisions: revisions.length,
      auditEvents: auditEvents.length,
      aiDrafts: aiDrafts.length,
      syncDevices: syncDevices.length,
      syncOperations: syncOperations.length,
    },
    data: {
      accounts,
      entries,
      documents,
      revisions,
      auditEvents,
      aiDrafts,
      syncDevices,
      syncOperations,
    },
  };
  const bytes = Buffer.from(backupJson(snapshot), "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const pathname = `${SNAPSHOT_PREFIX}${createdAt.toISOString().slice(0, 7)}/${safeTimestamp(createdAt)}-${sha256.slice(0, 12)}.json`;
  const blob = await put(pathname, bytes, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json; charset=utf-8",
  });

  const backup = await db.accountingBackup.create({
    data: {
      kind: "daily-json-snapshot",
      blobPathname: blob.pathname,
      blobUrl: blob.url,
      sha256,
      byteSize: bytes.byteLength,
      entryCount: entries.filter((entry) => !entry.deletedAt).length,
      documentCount: documents.filter((document) => !document.deletedAt).length,
      status: "verifying",
      createdBy,
    },
  });

  try {
    await verifyBlob(blob.pathname, bytes.byteLength, sha256);
    await verifyDocumentBlobs(documents);
    await db.accountingBackup.update({
      where: { id: backup.id },
      data: { status: "verified" },
    });
  } catch (error) {
    await db.accountingBackup.update({
      where: { id: backup.id },
      data: { status: "failed" },
    });
    throw error;
  }

  const pruned = await pruneSnapshots(createdAt);

  return {
    id: backup.id,
    createdAt: backup.createdAt.toISOString(),
    sha256,
    byteSize: bytes.byteLength,
    entryCount: backup.entryCount,
    documentCount: backup.documentCount,
    pruned,
  };
}
