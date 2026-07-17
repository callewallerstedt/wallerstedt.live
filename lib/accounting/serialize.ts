import type {
  AccountingAccount,
  AccountingAiDraft,
  AccountingAuditEvent,
  AccountingDocument,
  AccountingEntry,
  AccountingEntryRevision,
  Prisma,
} from "@prisma/client";

function money(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : value.toFixed(2);
}

function dateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function serializeAccount(account: AccountingAccount) {
  return {
    id: account.id,
    legacyId: account.legacyId,
    account: account.account,
    name: account.name,
    category: account.category,
    version: account.version,
    deletedAt: account.deletedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

export function serializeDocument(document: AccountingDocument) {
  return {
    id: document.id,
    legacyId: document.legacyId,
    legacyTransactionId: document.legacyTransactionId,
    entryId: document.entryId,
    originalName: document.originalName,
    sha256: document.sha256,
    byteSize: document.byteSize,
    mimeType: document.mimeType,
    storageStatus: document.storageStatus,
    version: document.version,
    deletedAt: document.deletedAt?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    downloadUrl:
      document.blobPathname && !document.deletedAt
        ? `documents/${document.id}/download`
        : null,
  };
}

type EntryWithDocuments = AccountingEntry & {
  documents?: AccountingDocument[];
  _count?: { documents: number };
};

export function serializeEntry(entry: EntryWithDocuments) {
  const amountExVat = money(entry.amountExVat);
  const vatAmount = money(entry.vatAmount);
  return {
    id: entry.id,
    legacyId: entry.legacyId,
    date: dateOnly(entry.date),
    description: entry.description,
    debitName: entry.debitName,
    debitAccount: entry.debitAccount,
    creditName: entry.creditName,
    creditAccount: entry.creditAccount,
    amountExVat,
    beloppExMoms: amountExVat,
    vatAmount,
    moms: vatAmount,
    vatAccount: entry.vatAccount,
    momsAccount: entry.vatAccount,
    amount: money(entry.amount),
    type: entry.type,
    source: entry.source,
    notes: entry.notes,
    status: entry.status,
    version: entry.version,
    deletedAt: entry.deletedAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    documentCount: entry._count?.documents ?? entry.documents?.length ?? 0,
    ...(entry.documents
      ? { documents: entry.documents.map(serializeDocument) }
      : {}),
  };
}

export function serializeRevision(revision: AccountingEntryRevision) {
  return {
    id: revision.id,
    entryId: revision.entryId,
    version: revision.version,
    action: revision.action,
    actor: revision.actor,
    snapshot: revision.snapshot,
    createdAt: revision.createdAt.toISOString(),
  };
}

export function serializeDraft(draft: AccountingAiDraft) {
  return {
    id: draft.id,
    status: draft.status,
    model: draft.model,
    inputText: draft.inputText,
    documentIds: draft.documentIds,
    ownedDocumentIds: draft.ownedDocumentIds,
    extracted: draft.extracted,
    entryId: draft.entryId,
    approvedAt: draft.approvedAt?.toISOString() ?? null,
    rejectedAt: draft.rejectedAt?.toISOString() ?? null,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export function serializeAuditEvent(event: AccountingAuditEvent) {
  return {
    cursor: event.id.toString(),
    entityType: event.entityType,
    operation: event.operation,
    remoteId: event.entityId,
    version: event.version,
    data: event.payload,
    createdAt: event.createdAt.toISOString(),
  };
}
