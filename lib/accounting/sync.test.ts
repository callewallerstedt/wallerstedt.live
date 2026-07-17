import assert from "node:assert/strict";
import test from "node:test";
import {
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
} from "@vercel/blob";
import { receiptAuditData } from "./audit";
import { unusedOwnedDocumentIds } from "./ai";
import { AccountingConflictError, AccountingError } from "./errors";
import {
  equivalentBootstrapAccount,
  equivalentBootstrapReceipt,
  equivalentBootstrapTransaction,
  changeData,
  isCompatibleLegacyId,
  isDeliverableSyncAuditEvent,
  isPersistableSyncConflict,
  storedReceiptMatchesFile,
} from "./sync";
import { canonicalEntryType } from "./validation";

test("canonicalEntryType maps mobile aliases and preserves Swedish debt type", () => {
  assert.equal(canonicalEntryType("expense"), "Utbetalning");
  assert.equal(canonicalEntryType("income"), "Inbetalning");
  assert.equal(canonicalEntryType("transfer"), "Överföring");
  assert.equal(canonicalEntryType("other"), "Övrigt");
  assert.equal(canonicalEntryType("Skuld"), "Skuld");
});

test("same UUIDv5 account bootstrap is idempotent but changed data conflicts", () => {
  const server = {
    legacyId: 1930,
    account: 1930,
    name: "Företagskonto",
    category: "Tillgång",
    version: 1,
    deletedAt: null,
  };
  assert.equal(
    equivalentBootstrapAccount(server, {
      legacyId: 1930,
      account: 1930,
      name: "Företagskonto",
      category: "Tillgång",
    }),
    true,
  );
  assert.equal(
    equivalentBootstrapAccount(server, {
      legacyId: 1930,
      account: 1930,
      name: "Changed",
      category: "Tillgång",
    }),
    false,
  );
});

test("same UUIDv5 transaction bootstrap compares canonical money and null status", () => {
  const server = {
    id: "22f59a8b-9f31-5b95-9fe4-2c7d9f7d0524",
    legacyId: 22,
    date: "2026-06-01",
    description: "Test",
    debitName: "Bankavgifter",
    debitAccount: 6570,
    creditName: "Företagskonto",
    creditAccount: 1930,
    amountExVat: "100.00",
    beloppExMoms: "100.00",
    vatAmount: null,
    moms: null,
    vatAccount: null,
    momsAccount: null,
    amount: "100.00",
    type: "Utbetalning",
    source: null,
    notes: "",
    status: null,
    version: 1,
    deletedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    documentCount: 0,
  } as Parameters<typeof equivalentBootstrapTransaction>[0];
  const incoming = {
    legacyId: 22,
    date: "2026-06-01",
    description: "Test",
    debitName: "Bankavgifter",
    debitAccount: 6570,
    creditName: "Företagskonto",
    creditAccount: 1930,
    amountExVat: "100",
    vatAmount: null,
    vatAccount: null,
    amount: "100.00",
    type: "Utbetalning",
    source: null,
    notes: "",
    status: null,
  } as Parameters<typeof equivalentBootstrapTransaction>[1];
  assert.equal(equivalentBootstrapTransaction(server, incoming), true);
  assert.equal(
    equivalentBootstrapTransaction(server, { ...incoming, amount: "100.01" }),
    false,
  );
});

test("same UUIDv5 receipt bootstrap requires matching metadata and stored hash", () => {
  const server = {
    version: 1,
    deletedAt: null,
    legacyId: 15,
    legacyTransactionId: 22,
    entryId: "ca2c55af-73eb-535e-a244-40f008a24a67",
    originalName: "receipt.pdf",
    storageStatus: "stored",
    sha256: "a".repeat(64),
  };
  const incoming = {
    legacyId: 15,
    legacyTransactionId: 22,
    transactionRemoteId: server.entryId,
    filename: server.originalName,
    addedAt: null,
    file: {
      name: server.originalName,
      mimeType: "application/pdf",
      size: 100,
      sha256: "a".repeat(64),
      pathname: "accounting-documents/id-receipt.pdf",
      url: "https://example.private.blob.vercel-storage.com/accounting-documents/id-receipt.pdf",
    },
  } as Parameters<typeof equivalentBootstrapReceipt>[1];
  assert.equal(equivalentBootstrapReceipt(server, incoming), true);
  assert.equal(
    equivalentBootstrapReceipt(server, {
      ...incoming,
      file: { ...incoming.file!, sha256: "b".repeat(64) },
    }),
    false,
  );
});

test("legacy IDs are immutable once assigned but may fill an empty cloud slot", () => {
  assert.equal(isCompatibleLegacyId(null, 42), true);
  assert.equal(isCompatibleLegacyId(42, 42), true);
  assert.equal(isCompatibleLegacyId(42, undefined), true);
  assert.equal(isCompatibleLegacyId(42, null), true);
  assert.equal(isCompatibleLegacyId(42, 43), false);
});

test("unattached AI receipts are deferred until an attached audit event exists", () => {
  const document = {
    id: "2ba9c4d4-61ba-4dfc-9bfb-63707710f6fb",
    legacyId: null,
    legacyTransactionId: null,
    entryId: null,
    originalName: "ai-receipt.png",
    blobPathname: "accounting-documents/ai-receipt.png",
    blobUrl:
      "https://example.private.blob.vercel-storage.com/accounting-documents/ai-receipt.png",
    sha256: "a".repeat(64),
    byteSize: 123,
    mimeType: "image/png",
    storageStatus: "stored",
    version: 1,
    deletedAt: null,
    createdAt: new Date("2026-07-17T08:00:00.000Z"),
    updatedAt: new Date("2026-07-17T08:00:00.000Z"),
  } as Parameters<typeof receiptAuditData>[0];
  const pending = receiptAuditData(document, "upsert", "web-ai-upload");
  assert.equal(
    isDeliverableSyncAuditEvent({
      entityType: pending.entityType,
      payload: pending.payload as Parameters<
        typeof isDeliverableSyncAuditEvent
      >[0]["payload"],
    }),
    false,
  );

  const attached = receiptAuditData(
    {
      ...document,
      entryId: "ca2c55af-73eb-535e-a244-40f008a24a67",
      version: 2,
    },
    "upsert",
    "web-ai-approved",
  );
  const payload = attached.payload as unknown as Record<string, unknown>;
  assert.equal(payload.entryId, "ca2c55af-73eb-535e-a244-40f008a24a67");
  assert.equal(attached.version, 2);
  assert.equal(
    isDeliverableSyncAuditEvent({
      entityType: attached.entityType,
      payload: attached.payload as Parameters<
        typeof isDeliverableSyncAuditEvent
      >[0]["payload"],
    }),
    true,
  );
});

test("metadata-only receipt repair becomes a v2 stored downloadable change", () => {
  const base = {
    id: "c4dd75ba-f6ab-4a0e-95ff-1a790e494c89",
    legacyId: 15,
    legacyTransactionId: 22,
    entryId: "ca2c55af-73eb-535e-a244-40f008a24a67",
    originalName: "receipt.pdf",
    blobPathname: null,
    blobUrl: null,
    sha256: null,
    byteSize: null,
    mimeType: null,
    storageStatus: "metadata_only",
    version: 1,
    deletedAt: null,
    createdAt: new Date("2026-07-17T08:00:00.000Z"),
    updatedAt: new Date("2026-07-17T08:00:00.000Z"),
  } as Parameters<typeof receiptAuditData>[0];
  assert.equal(
    storedReceiptMatchesFile(base, { sha256: "b".repeat(64) }),
    false,
  );

  const stored = {
    ...base,
    blobPathname: "accounting/documents/c4dd75ba-v2.pdf",
    blobUrl:
      "https://example.private.blob.vercel-storage.com/accounting/documents/c4dd75ba-v2.pdf",
    sha256: "b".repeat(64),
    byteSize: 456,
    mimeType: "application/pdf",
    storageStatus: "stored",
    version: 2,
  };
  const event = receiptAuditData(stored, "upsert", "desktop:test");
  const data = changeData(
    "receipt",
    event.payload as Parameters<typeof changeData>[1],
  ) as Record<string, unknown>;
  assert.equal(event.version, 2);
  assert.equal(data.storageStatus, "stored");
  assert.equal(
    data.downloadPath,
    `/api/accounting/sync/documents/${stored.id}`,
  );
  assert.equal(
    storedReceiptMatchesFile(stored, { sha256: "b".repeat(64) }),
    true,
  );
});

test("only deterministic sync failures become permanent idempotent conflicts", () => {
  assert.equal(
    isPersistableSyncConflict(new AccountingConflictError("conflict")),
    true,
  );
  assert.equal(
    isPersistableSyncConflict(
      new AccountingError("invalid", 400, "invalid_input"),
    ),
    true,
  );
  assert.equal(
    isPersistableSyncConflict(
      new AccountingError("unavailable", 503, "blob_unavailable"),
    ),
    false,
  );
  assert.equal(isPersistableSyncConflict(new Error("network")), false);
  assert.equal(
    isPersistableSyncConflict(new BlobServiceNotAvailable()),
    false,
  );
  assert.equal(isPersistableSyncConflict(new BlobServiceRateLimited()), false);
  assert.equal(isPersistableSyncConflict(new BlobRequestAbortedError()), false);
});

test("AI cleanup only purges owned uploads left unattached", () => {
  assert.deepEqual(
    unusedOwnedDocumentIds(
      ["owned-a", "owned-b", "owned-b", "owned-c"],
      ["owned-a", "existing-not-owned"],
    ),
    ["owned-b", "owned-c"],
  );
});
