import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { writeReceiptAudit } from "./audit";
import { getAccountingDb } from "./db";
import {
  inspectDocumentBytes,
  MAX_DOCUMENT_BYTES,
  putPrivateDocumentBlob,
  type SniffedDocument,
} from "./documents";
import {
  AccountingConflictError,
  AccountingError,
  redactedErrorDiagnostic,
} from "./errors";
import {
  serializeAccount,
  serializeDocument,
  serializeEntry,
} from "./serialize";
import {
  createEntryInTransaction,
  deleteEntryInTransaction,
  updateEntryInTransaction,
} from "./service";
import {
  entryCreateSchema,
  normalizeEntryInput,
  parseOptionalDateTime,
  parseWithSchema,
} from "./validation";
import {
  verifyPrivateBlobReference,
  type ClientBlobReference,
  type VerifiedClientBlob,
} from "./uploads";

const MAX_INLINE_RECEIPT_BYTES = 2 * 1024 * 1024;
const legacyIdSchema = z
  .number()
  .int()
  .positive()
  .max(2_147_483_647)
  .optional()
  .nullable();

export function isCompatibleLegacyId(
  current: number | null,
  incoming: number | null | undefined,
) {
  return (
    incoming === null ||
    incoming === undefined ||
    current === null ||
    current === incoming
  );
}

const syncOperationSchema = z.object({
  opId: z.string().trim().min(1).max(200),
  entityType: z.enum(["transaction", "account", "receipt"]),
  operation: z.enum(["upsert", "delete"]),
  remoteId: z.string().uuid().optional().nullable(),
  version: z.number().int().nonnegative().optional().nullable(),
  baseVersion: z.number().int().nonnegative().optional().nullable(),
  data: z.record(z.string(), z.unknown()).default({}),
});

const syncRequestSchema = z.object({
  cursor: z
    .string()
    .regex(/^\d{1,30}$/)
    .optional()
    .nullable(),
  operations: z.array(syncOperationSchema).max(250).default([]),
});

type SyncOperation = z.output<typeof syncOperationSchema>;
type TransactionClient = Prisma.TransactionClient;
type Ack = { opId: string; remoteId: string; version: number };
type Conflict = {
  opId: string;
  remoteId: string | null;
  serverVersion: number | null;
  server: unknown;
  reason: string;
};

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function actor(deviceId: string) {
  return `desktop:${deviceId}`.slice(0, 200);
}

function conflictFromError(operation: SyncOperation, error: unknown): Conflict {
  if (error instanceof AccountingConflictError) {
    const details =
      error.details && typeof error.details === "object"
        ? (error.details as Record<string, unknown>)
        : {};
    return {
      opId: operation.opId,
      remoteId: operation.remoteId ?? null,
      serverVersion:
        typeof details.serverVersion === "number"
          ? details.serverVersion
          : null,
      server: details.server ?? null,
      reason: error.code,
    };
  }
  if (error instanceof AccountingError) {
    return {
      opId: operation.opId,
      remoteId: operation.remoteId ?? null,
      serverVersion: null,
      server: null,
      reason: error.code,
    };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      opId: operation.opId,
      remoteId: operation.remoteId ?? null,
      serverVersion: null,
      server: null,
      reason: error.code === "P2002" ? "unique_conflict" : "database_conflict",
    };
  }
  console.error(
    "Unexpected accounting sync operation error",
    redactedErrorDiagnostic(error),
  );
  return {
    opId: operation.opId,
    remoteId: operation.remoteId ?? null,
    serverVersion: null,
    server: null,
    reason: "operation_failed",
  };
}

export function isPersistableSyncConflict(error: unknown) {
  if (error instanceof AccountingConflictError) return true;
  if (error instanceof AccountingError) return error.status < 500;
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function accountData(value: Record<string, unknown>) {
  return parseWithSchema(
    z.object({
      legacyId: legacyIdSchema,
      account: z.number().int().min(1000).max(9999),
      name: z.string().trim().min(1).max(200),
      category: z.string().trim().max(100).optional().nullable(),
    }),
    value,
  );
}

export function equivalentBootstrapAccount(
  server: {
    legacyId: number | null;
    account: number;
    name: string;
    category: string | null;
    version: number;
    deletedAt: Date | null;
  },
  incoming: {
    legacyId?: number | null;
    account: number;
    name: string;
    category?: string | null;
  },
) {
  return (
    server.version === 1 &&
    !server.deletedAt &&
    server.legacyId === (incoming.legacyId ?? null) &&
    server.account === incoming.account &&
    server.name === incoming.name &&
    server.category === (incoming.category ?? null)
  );
}

function decimal(value: string | null | undefined) {
  return value === null || value === undefined
    ? null
    : new Prisma.Decimal(value).toFixed(2);
}

export function equivalentBootstrapTransaction(
  server: ReturnType<typeof serializeEntry>,
  incoming: ReturnType<typeof transactionInput>,
) {
  return (
    server.version === 1 &&
    !server.deletedAt &&
    server.legacyId === (incoming.legacyId ?? null) &&
    server.date === (incoming.date ?? null) &&
    server.description === (incoming.description ?? "") &&
    server.debitName === (incoming.debitName ?? null) &&
    server.debitAccount === (incoming.debitAccount ?? null) &&
    server.creditName === (incoming.creditName ?? null) &&
    server.creditAccount === (incoming.creditAccount ?? null) &&
    server.amountExVat === decimal(incoming.amountExVat) &&
    server.vatAmount === decimal(incoming.vatAmount) &&
    server.vatAccount === (incoming.vatAccount ?? null) &&
    server.amount === decimal(incoming.amount) &&
    server.type === (incoming.type ?? "Utbetalning") &&
    server.source === (incoming.source ?? null) &&
    server.notes === (incoming.notes ?? "") &&
    (server.receiptRequired ?? true) === (incoming.receiptRequired ?? true) &&
    server.status ===
      (incoming.status === undefined ? "Bokförd" : incoming.status)
  );
}

export function equivalentBootstrapReceipt(
  server: {
    version: number;
    deletedAt: Date | null;
    legacyId: number | null;
    legacyTransactionId: number | null;
    entryId: string | null;
    originalName: string;
    storageStatus: string;
    sha256: string | null;
  },
  incoming: ReturnType<typeof receiptData>,
) {
  const metadataMatches =
    server.version === 1 &&
    !server.deletedAt &&
    server.legacyId === (incoming.legacyId ?? null) &&
    server.legacyTransactionId === (incoming.legacyTransactionId ?? null) &&
    server.entryId === incoming.transactionRemoteId &&
    server.originalName === incoming.filename;
  if (!metadataMatches) return false;
  if (!incoming.file) return true;
  return (
    server.storageStatus === "stored" &&
    server.sha256?.toLocaleLowerCase("en") ===
      incoming.file.sha256.toLocaleLowerCase("en")
  );
}

async function auditAccount(
  tx: TransactionClient,
  account: Awaited<
    ReturnType<TransactionClient["accountingAccount"]["findUniqueOrThrow"]>
  >,
  operation: "upsert" | "delete",
  deviceId: string,
) {
  await tx.accountingAuditEvent.create({
    data: {
      entityType: "account",
      entityId: account.id,
      operation,
      version: account.version,
      actor: actor(deviceId),
      payload: json(serializeAccount(account)),
    },
  });
}

async function applyAccount(
  tx: TransactionClient,
  operation: SyncOperation,
  deviceId: string,
): Promise<Ack> {
  if (!operation.remoteId || operation.baseVersion === 0) {
    if (operation.operation === "delete") {
      throw new AccountingError(
        "Cannot delete an unsynced account.",
        409,
        "missing_remote_id",
      );
    }
    const data = accountData(operation.data);
    const existingById = operation.remoteId
      ? await tx.accountingAccount.findUnique({
          where: { id: operation.remoteId },
        })
      : null;
    if (existingById && equivalentBootstrapAccount(existingById, data)) {
      return {
        opId: operation.opId,
        remoteId: existingById.id,
        version: existingById.version,
      };
    }
    const existing =
      existingById ??
      (await tx.accountingAccount.findFirst({
        where: {
          OR: [
            { account: data.account },
            ...(data.legacyId ? [{ legacyId: data.legacyId }] : []),
          ],
        },
      }));
    if (existing) {
      throw new AccountingConflictError("Account number already exists.", {
        server: serializeAccount(existing),
        serverVersion: existing.version,
      });
    }
    const account = await tx.accountingAccount.create({
      data: {
        ...data,
        ...(operation.remoteId ? { id: operation.remoteId } : {}),
      },
    });
    await auditAccount(tx, account, "upsert", deviceId);
    return {
      opId: operation.opId,
      remoteId: account.id,
      version: account.version,
    };
  }

  const current = await tx.accountingAccount.findUnique({
    where: { id: operation.remoteId },
  });
  if (!current) {
    throw new AccountingConflictError("Remote account no longer exists.", {
      server: null,
      serverVersion: null,
    });
  }
  if (operation.baseVersion === null || operation.baseVersion === undefined) {
    throw new AccountingConflictError("A base version is required.", {
      server: serializeAccount(current),
      serverVersion: current.version,
    });
  }
  if (current.version !== operation.baseVersion || current.deletedAt) {
    throw new AccountingConflictError("Account version conflict.", {
      server: serializeAccount(current),
      serverVersion: current.version,
    });
  }
  const nextData =
    operation.operation === "upsert" ? accountData(operation.data) : null;
  if (nextData && !isCompatibleLegacyId(current.legacyId, nextData.legacyId)) {
    throw new AccountingConflictError("Account local ID conflict.", {
      server: serializeAccount(current),
      serverVersion: current.version,
    });
  }
  const result = await tx.accountingAccount.updateMany({
    where: { id: current.id, version: operation.baseVersion },
    data:
      operation.operation === "delete"
        ? { deletedAt: new Date(), version: { increment: 1 } }
        : {
            account: nextData!.account,
            name: nextData!.name,
            category: nextData!.category,
            ...(nextData!.legacyId ? { legacyId: nextData!.legacyId } : {}),
            version: { increment: 1 },
          },
  });
  if (result.count !== 1) {
    const server = await tx.accountingAccount.findUnique({
      where: { id: current.id },
    });
    throw new AccountingConflictError("Account version conflict.", {
      server: server ? serializeAccount(server) : null,
      serverVersion: server?.version ?? null,
    });
  }
  const account = await tx.accountingAccount.findUniqueOrThrow({
    where: { id: current.id },
  });
  await auditAccount(tx, account, operation.operation, deviceId);
  return {
    opId: operation.opId,
    remoteId: account.id,
    version: account.version,
  };
}

function transactionInput(data: Record<string, unknown>) {
  const parsed = parseWithSchema(entryCreateSchema, data);
  return {
    ...normalizeEntryInput(parsed),
    createdAt: parseOptionalDateTime(data.createdAt),
    updatedAt: parseOptionalDateTime(data.updatedAt),
  };
}

async function applyTransaction(
  tx: TransactionClient,
  operation: SyncOperation,
  deviceId: string,
): Promise<Ack> {
  if (!operation.remoteId || operation.baseVersion === 0) {
    if (operation.operation === "delete") {
      throw new AccountingError(
        "Cannot delete an unsynced transaction.",
        409,
        "missing_remote_id",
      );
    }
    const input = transactionInput(operation.data);
    const existingById = operation.remoteId
      ? await tx.accountingEntry.findUnique({
          where: { id: operation.remoteId },
        })
      : null;
    if (
      existingById &&
      equivalentBootstrapTransaction(serializeEntry(existingById), input)
    ) {
      return {
        opId: operation.opId,
        remoteId: existingById.id,
        version: existingById.version,
      };
    }
    const existingByLegacyId = input.legacyId
      ? await tx.accountingEntry.findUnique({
          where: { legacyId: input.legacyId },
        })
      : null;
    if (
      existingByLegacyId &&
      operation.remoteId &&
      existingByLegacyId.id !== operation.remoteId
    ) {
      throw new AccountingConflictError(
        "Transaction local ID is already in use.",
        {
          server: serializeEntry(existingByLegacyId),
          serverVersion: existingByLegacyId.version,
        },
      );
    }
    const existing = existingById ?? existingByLegacyId;
    if (
      existing &&
      equivalentBootstrapTransaction(serializeEntry(existing), input)
    ) {
      return {
        opId: operation.opId,
        remoteId: existing.id,
        version: existing.version,
      };
    }
    if (existing) {
      throw new AccountingConflictError(
        "Bootstrap transaction differs from the cloud row.",
        {
          server: serializeEntry(existing),
          serverVersion: existing.version,
        },
      );
    }
    const entry = await createEntryInTransaction(
      tx,
      input,
      actor(deviceId),
      operation.remoteId ? { id: operation.remoteId } : {},
    );
    return { opId: operation.opId, remoteId: entry.id, version: entry.version };
  }
  if (operation.baseVersion === null || operation.baseVersion === undefined) {
    const current = await tx.accountingEntry.findUnique({
      where: { id: operation.remoteId },
    });
    throw new AccountingConflictError("A base version is required.", {
      server: current ? serializeEntry(current) : null,
      serverVersion: current?.version ?? null,
    });
  }
  const updateInput =
    operation.operation === "upsert"
      ? transactionInput(operation.data)
      : undefined;
  if (updateInput?.legacyId) {
    const [current, existingByLegacyId] = await Promise.all([
      tx.accountingEntry.findUnique({ where: { id: operation.remoteId } }),
      tx.accountingEntry.findUnique({
        where: { legacyId: updateInput.legacyId },
      }),
    ]);
    if (
      (current &&
        !isCompatibleLegacyId(current.legacyId, updateInput.legacyId)) ||
      (existingByLegacyId && existingByLegacyId.id !== operation.remoteId)
    ) {
      throw new AccountingConflictError("Transaction local ID conflict.", {
        server: current ? serializeEntry(current) : null,
        serverVersion: current?.version ?? null,
      });
    }
  }
  const entry =
    operation.operation === "delete"
      ? await deleteEntryInTransaction(
          tx,
          operation.remoteId,
          operation.baseVersion,
          actor(deviceId),
        )
      : await updateEntryInTransaction(
          tx,
          operation.remoteId,
          operation.baseVersion,
          updateInput!,
          actor(deviceId),
        );
  return { opId: operation.opId, remoteId: entry.id, version: entry.version };
}

function receiptData(value: Record<string, unknown>) {
  const nestedFile =
    value.file && typeof value.file === "object" && !Array.isArray(value.file)
      ? value.file
      : value.fileBase64
        ? {
            name: value.fileName ?? value.filename,
            mimeType: value.mimeType,
            size: value.fileSize,
            sha256: value.sha256,
            base64: value.fileBase64,
          }
        : undefined;
  return parseWithSchema(
    z.object({
      legacyId: legacyIdSchema,
      legacyTransactionId: legacyIdSchema,
      transactionRemoteId: z.string().uuid(),
      filename: z.string().trim().min(1).max(180),
      addedAt: z.string().optional().nullable(),
      file: z
        .object({
          name: z.string().trim().min(1).max(180),
          mimeType: z.string().trim().min(1).max(100),
          size: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
          sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
          base64: z.string().min(1).max(2_800_000).optional(),
          pathname: z.string().max(240).optional(),
          url: z.string().url().max(1_000).optional(),
          downloadUrl: z.string().url().max(1_200).optional().nullable(),
          etag: z.string().max(300).optional().nullable(),
        })
        .refine(
          (file) => Boolean(file.base64 || (file.pathname && file.url)),
          "Receipt file requires base64 or a verified Blob reference.",
        )
        .optional(),
    }),
    { ...value, file: nestedFile },
  );
}

async function resolveReceiptFile(
  file: NonNullable<ReturnType<typeof receiptData>["file"]>,
): Promise<{
  inspected: SniffedDocument;
  existingBlob: VerifiedClientBlob["blob"] | null;
}> {
  if (file.pathname && file.url) {
    const verified = await verifyPrivateBlobReference(
      file as ClientBlobReference,
    );
    return { inspected: verified.inspected, existingBlob: verified.blob };
  }
  if (!file.base64) {
    throw new AccountingError(
      "Receipt content is missing.",
      400,
      "receipt_content_missing",
    );
  }
  if (
    file.base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)
  ) {
    throw new AccountingError(
      "Receipt content is not valid base64.",
      400,
      "invalid_receipt_base64",
    );
  }
  const buffer = Buffer.from(file.base64, "base64");
  if (
    buffer.byteLength !== file.size ||
    buffer.byteLength > MAX_INLINE_RECEIPT_BYTES
  ) {
    throw new AccountingError(
      "Receipt size does not match its payload.",
      400,
      "receipt_size_mismatch",
    );
  }
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (sha256.toLocaleLowerCase("en") !== file.sha256.toLocaleLowerCase("en")) {
    throw new AccountingError(
      "Receipt checksum verification failed.",
      400,
      "receipt_checksum_mismatch",
    );
  }
  const inspected = await inspectDocumentBytes(
    file.name,
    file.mimeType,
    buffer,
  );
  if (inspected.sha256 !== sha256) {
    throw new AccountingError(
      "Receipt checksum verification failed.",
      400,
      "receipt_checksum_mismatch",
    );
  }
  return { inspected, existingBlob: null };
}

type ReceiptSyncData = ReturnType<typeof receiptData>;
type ResolvedReceiptFile = Awaited<ReturnType<typeof resolveReceiptFile>>;
type PreparedReceiptOperation = {
  data?: ReceiptSyncData;
  resolved: ResolvedReceiptFile | null;
  blob: VerifiedClientBlob["blob"] | null;
  documentId: string | null;
  documentVersion: number | null;
  createdBlobPathname: string | null;
};

export function storedReceiptMatchesFile(
  current: { storageStatus: string; sha256: string | null },
  file: { sha256: string },
) {
  return (
    current.storageStatus === "stored" &&
    current.sha256?.toLocaleLowerCase("en") ===
      file.sha256.toLocaleLowerCase("en")
  );
}

function unpreparedReceipt(data?: ReceiptSyncData): PreparedReceiptOperation {
  return {
    data,
    resolved: null,
    blob: null,
    documentId: null,
    documentVersion: null,
    createdBlobPathname: null,
  };
}

async function prepareReceiptOperation(
  operation: SyncOperation,
): Promise<PreparedReceiptOperation> {
  if (operation.operation === "delete") return unpreparedReceipt();
  const data = receiptData(operation.data);
  if (!data.file) return unpreparedReceipt(data);

  const db = getAccountingDb();
  const entry = await db.accountingEntry.findFirst({
    where: { id: data.transactionRemoteId, deletedAt: null },
  });
  if (!entry) return unpreparedReceipt(data);

  const existingById = operation.remoteId
    ? await db.accountingDocument.findUnique({
        where: { id: operation.remoteId },
      })
    : null;
  const existingByLegacyId = data.legacyId
    ? await db.accountingDocument.findUnique({
        where: { legacyId: data.legacyId },
      })
    : null;
  if (
    existingByLegacyId &&
    operation.remoteId &&
    existingByLegacyId.id !== operation.remoteId
  ) {
    return unpreparedReceipt(data);
  }
  const current = existingById ?? existingByLegacyId;
  const bootstrap = !operation.remoteId || operation.baseVersion === 0;
  let documentId: string;
  let documentVersion: number;

  if (bootstrap) {
    if (current) {
      const repairable =
        current.version === 1 &&
        !current.deletedAt &&
        current.entryId === data.transactionRemoteId &&
        current.originalName === data.filename &&
        current.storageStatus === "metadata_only" &&
        isCompatibleLegacyId(current.legacyId, data.legacyId) &&
        isCompatibleLegacyId(
          current.legacyTransactionId,
          data.legacyTransactionId,
        );
      if (!repairable || storedReceiptMatchesFile(current, data.file)) {
        return unpreparedReceipt(data);
      }
      documentId = current.id;
      documentVersion = current.version + 1;
    } else {
      documentId = operation.remoteId ?? randomUUID();
      documentVersion = 1;
    }
  } else {
    if (
      !current ||
      current.id !== operation.remoteId ||
      current.deletedAt ||
      operation.baseVersion === null ||
      operation.baseVersion === undefined ||
      current.version !== operation.baseVersion ||
      storedReceiptMatchesFile(current, data.file)
    ) {
      return unpreparedReceipt(data);
    }
    documentId = current.id;
    documentVersion = current.version + 1;
  }

  const resolved = await resolveReceiptFile(data.file);
  if (resolved.existingBlob) {
    return {
      data,
      resolved,
      blob: resolved.existingBlob,
      documentId,
      documentVersion,
      createdBlobPathname: null,
    };
  }
  const blob = await putPrivateDocumentBlob(
    resolved.inspected,
    documentId,
    documentVersion,
  );
  return {
    data,
    resolved,
    blob,
    documentId,
    documentVersion,
    createdBlobPathname: blob.pathname,
  };
}

async function cleanupPreparedReceiptBlob(
  prepared: PreparedReceiptOperation | undefined,
) {
  const pathname = prepared?.createdBlobPathname;
  if (!pathname) return;
  try {
    const inUse = await getAccountingDb().accountingDocument.findFirst({
      where: { blobPathname: pathname },
      select: { id: true },
    });
    if (inUse) return;
    const { del } = await import("@vercel/blob");
    await del(pathname);
  } catch (error) {
    console.error(
      "Accounting receipt Blob cleanup failed",
      redactedErrorDiagnostic(error),
    );
  }
}

async function applyReceipt(
  tx: TransactionClient,
  operation: SyncOperation,
  deviceId: string,
  prepared: PreparedReceiptOperation,
): Promise<Ack> {
  if (!operation.remoteId || operation.baseVersion === 0) {
    if (operation.operation === "delete") {
      throw new AccountingError(
        "Cannot delete an unsynced receipt.",
        409,
        "missing_remote_id",
      );
    }
    const data = prepared.data ?? receiptData(operation.data);
    const entry = await tx.accountingEntry.findFirst({
      where: { id: data.transactionRemoteId, deletedAt: null },
    });
    if (!entry) {
      throw new AccountingConflictError(
        "The receipt's transaction is unavailable.",
        {
          server: null,
          serverVersion: null,
        },
      );
    }
    if (
      data.legacyTransactionId &&
      entry.legacyId &&
      data.legacyTransactionId !== entry.legacyId
    ) {
      throw new AccountingConflictError(
        "Receipt local transaction ID conflict.",
        { server: serializeEntry(entry), serverVersion: entry.version },
      );
    }
    const addedAt = parseOptionalDateTime(data.addedAt);
    const existingById = operation.remoteId
      ? await tx.accountingDocument.findUnique({
          where: { id: operation.remoteId },
        })
      : null;
    const existingByLegacyId = data.legacyId
      ? await tx.accountingDocument.findUnique({
          where: { legacyId: data.legacyId },
        })
      : null;
    if (
      existingByLegacyId &&
      operation.remoteId &&
      existingByLegacyId.id !== operation.remoteId
    ) {
      throw new AccountingConflictError("Receipt local ID is already in use.", {
        server: serializeDocument(existingByLegacyId),
        serverVersion: existingByLegacyId.version,
      });
    }
    const existing = existingById ?? existingByLegacyId;
    if (existing && equivalentBootstrapReceipt(existing, data)) {
      return {
        opId: operation.opId,
        remoteId: existing.id,
        version: existing.version,
      };
    }
    if (
      existing &&
      existing.version === 1 &&
      !existing.deletedAt &&
      existing.entryId === data.transactionRemoteId &&
      existing.originalName === data.filename &&
      existing.storageStatus === "metadata_only" &&
      isCompatibleLegacyId(existing.legacyId, data.legacyId) &&
      isCompatibleLegacyId(
        existing.legacyTransactionId,
        data.legacyTransactionId,
      ) &&
      data.file
    ) {
      const resolved = prepared.resolved;
      const blob = prepared.blob;
      if (
        !resolved ||
        !blob ||
        prepared.documentId !== existing.id ||
        prepared.documentVersion !== existing.version + 1
      ) {
        throw new AccountingConflictError(
          "Receipt file preparation became stale.",
          {
            server: serializeDocument(existing),
            serverVersion: existing.version,
          },
        );
      }
      const repairedResult = await tx.accountingDocument.updateMany({
        where: {
          id: existing.id,
          version: existing.version,
          deletedAt: null,
          storageStatus: "metadata_only",
        },
        data: {
          blobPathname: blob.pathname,
          blobUrl: blob.url,
          sha256: resolved.inspected.sha256,
          byteSize: resolved.inspected.buffer.byteLength,
          mimeType: resolved.inspected.mimeType,
          storageStatus: "stored",
          ...(data.legacyId ? { legacyId: data.legacyId } : {}),
          ...(data.legacyTransactionId
            ? { legacyTransactionId: data.legacyTransactionId }
            : {}),
          version: { increment: 1 },
        },
      });
      if (repairedResult.count !== 1) {
        const server = await tx.accountingDocument.findUnique({
          where: { id: existing.id },
        });
        throw new AccountingConflictError("Receipt version conflict.", {
          server: server ? serializeDocument(server) : null,
          serverVersion: server?.version ?? null,
        });
      }
      const repaired = await tx.accountingDocument.findUniqueOrThrow({
        where: { id: existing.id },
      });
      await writeReceiptAudit(tx, repaired, "upsert", actor(deviceId));
      return {
        opId: operation.opId,
        remoteId: repaired.id,
        version: repaired.version,
      };
    }
    if (existing) {
      throw new AccountingConflictError(
        "Bootstrap receipt differs from the cloud row.",
        {
          server: serializeDocument(existing),
          serverVersion: existing.version,
        },
      );
    }
    const id = prepared.documentId ?? operation.remoteId ?? randomUUID();
    const resolved = data.file ? prepared.resolved : null;
    if (data.file && (!resolved || !prepared.blob)) {
      throw new AccountingConflictError(
        "Receipt file preparation became stale.",
        { server: null, serverVersion: null },
      );
    }
    const inspected = resolved?.inspected ?? null;
    const blob = resolved ? prepared.blob : null;
    const document = await tx.accountingDocument.create({
      data: {
        id,
        legacyId: data.legacyId ?? null,
        legacyTransactionId: data.legacyTransactionId ?? null,
        entryId: entry.id,
        originalName: data.filename,
        blobPathname: blob?.pathname ?? null,
        blobUrl: blob?.url ?? null,
        sha256: inspected?.sha256 ?? null,
        byteSize: inspected?.buffer.byteLength ?? null,
        mimeType: inspected?.mimeType ?? null,
        storageStatus: blob ? "stored" : "metadata_only",
        ...(addedAt ? { createdAt: addedAt, updatedAt: addedAt } : {}),
      },
    });
    await writeReceiptAudit(tx, document, "upsert", actor(deviceId));
    return {
      opId: operation.opId,
      remoteId: document.id,
      version: document.version,
    };
  }
  const current = await tx.accountingDocument.findUnique({
    where: { id: operation.remoteId },
  });
  if (!current) {
    throw new AccountingConflictError("Remote receipt no longer exists.", {
      server: null,
      serverVersion: null,
    });
  }
  if (operation.baseVersion === null || operation.baseVersion === undefined) {
    throw new AccountingConflictError("A base version is required.", {
      server: serializeDocument(current),
      serverVersion: current.version,
    });
  }
  if (current.version !== operation.baseVersion || current.deletedAt) {
    throw new AccountingConflictError("Receipt version conflict.", {
      server: serializeDocument(current),
      serverVersion: current.version,
    });
  }
  let data: ReturnType<typeof receiptData> | undefined;
  if (operation.operation === "upsert") {
    data = prepared.data ?? receiptData(operation.data);
    const entry = await tx.accountingEntry.findFirst({
      where: { id: data.transactionRemoteId, deletedAt: null },
    });
    if (!entry) {
      throw new AccountingConflictError(
        "The receipt's transaction is unavailable.",
        {
          server: serializeDocument(current),
          serverVersion: current.version,
        },
      );
    }
    const existingByLegacyId = data.legacyId
      ? await tx.accountingDocument.findUnique({
          where: { legacyId: data.legacyId },
        })
      : null;
    if (
      !isCompatibleLegacyId(current.legacyId, data.legacyId) ||
      !isCompatibleLegacyId(
        current.legacyTransactionId,
        data.legacyTransactionId,
      ) ||
      (existingByLegacyId && existingByLegacyId.id !== current.id) ||
      (data.legacyTransactionId &&
        entry.legacyId &&
        data.legacyTransactionId !== entry.legacyId)
    ) {
      throw new AccountingConflictError("Receipt local ID conflict.", {
        server: serializeDocument(current),
        serverVersion: current.version,
      });
    }
  }
  const resolved = data?.file ? prepared.resolved : null;
  const inspected = resolved?.inspected ?? null;
  const nextVersion = current.version + 1;
  const needsBlob = Boolean(
    data?.file && !storedReceiptMatchesFile(current, data.file),
  );
  if (
    needsBlob &&
    (!resolved ||
      !inspected ||
      !prepared.blob ||
      prepared.documentId !== current.id ||
      prepared.documentVersion !== nextVersion)
  ) {
    throw new AccountingConflictError(
      "Receipt file preparation became stale.",
      {
        server: serializeDocument(current),
        serverVersion: current.version,
      },
    );
  }
  const blob = needsBlob ? prepared.blob : null;
  const result = await tx.accountingDocument.updateMany({
    where: { id: current.id, version: operation.baseVersion },
    data:
      operation.operation === "delete"
        ? { deletedAt: new Date(), version: { increment: 1 } }
        : {
            ...(data!.legacyId ? { legacyId: data!.legacyId } : {}),
            ...(data!.legacyTransactionId
              ? { legacyTransactionId: data!.legacyTransactionId }
              : {}),
            entryId: data!.transactionRemoteId,
            originalName: data!.filename,
            ...(blob && inspected
              ? {
                  blobPathname: blob.pathname,
                  blobUrl: blob.url,
                  sha256: inspected.sha256,
                  byteSize: inspected.buffer.byteLength,
                  mimeType: inspected.mimeType,
                  storageStatus: "stored",
                }
              : {}),
            version: { increment: 1 },
          },
  });
  if (result.count !== 1) {
    const server = await tx.accountingDocument.findUnique({
      where: { id: current.id },
    });
    throw new AccountingConflictError("Receipt version conflict.", {
      server: server ? serializeDocument(server) : null,
      serverVersion: server?.version ?? null,
    });
  }
  const document = await tx.accountingDocument.findUniqueOrThrow({
    where: { id: current.id },
  });
  await writeReceiptAudit(tx, document, operation.operation, actor(deviceId));
  return {
    opId: operation.opId,
    remoteId: document.id,
    version: document.version,
  };
}

function storedResult(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  if (object.kind === "ack") return { ack: object.value as Ack };
  if (object.kind === "conflict") return { conflict: object.value as Conflict };
  return null;
}

function redactedOperation(operation: SyncOperation) {
  const data = { ...operation.data };
  if (data.file && typeof data.file === "object" && !Array.isArray(data.file)) {
    const file = { ...(data.file as Record<string, unknown>) };
    if ("base64" in file) {
      delete file.base64;
      file.inlineContentRedacted = true;
    }
    data.file = file;
  }
  if ("fileBase64" in data) {
    delete data.fileBase64;
    data.inlineContentRedacted = true;
  }
  return { ...operation, data };
}

async function applyOperation(operation: SyncOperation, deviceId: string) {
  const db = getAccountingDb();
  const stored = await db.accountingSyncOperation.findUnique({
    where: { id: operation.opId },
  });
  if (stored) {
    const result = storedResult(stored.response);
    if (result) return result;
  }

  let preparedReceipt: PreparedReceiptOperation | undefined;
  let preparationError: unknown;
  if (operation.entityType === "receipt") {
    try {
      preparedReceipt = await prepareReceiptOperation(operation);
    } catch (error) {
      if (error instanceof AccountingError && error.status < 500) {
        preparationError = error;
        preparedReceipt = unpreparedReceipt();
      } else {
        throw error;
      }
    }
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.accountingSyncOperation.findUnique({
        where: { id: operation.opId },
      });
      if (existing) {
        const result = storedResult(existing.response);
        if (result) return result;
      }

      let result: { ack?: Ack; conflict?: Conflict };
      try {
        if (preparationError) throw preparationError;
        const ack =
          operation.entityType === "account"
            ? await applyAccount(tx, operation, deviceId)
            : operation.entityType === "transaction"
              ? await applyTransaction(tx, operation, deviceId)
              : await applyReceipt(tx, operation, deviceId, preparedReceipt!);
        result = { ack };
      } catch (error) {
        if (!isPersistableSyncConflict(error)) throw error;
        result = { conflict: conflictFromError(operation, error) };
      }

      await tx.accountingSyncOperation.create({
        data: {
          id: operation.opId,
          deviceId,
          entityType: operation.entityType,
          entityId: result.ack?.remoteId ?? operation.remoteId ?? null,
          operation: operation.operation,
          baseVersion: operation.baseVersion ?? null,
          appliedVersion: result.ack?.version ?? null,
          status: result.ack ? "acked" : "conflict",
          request: json(redactedOperation(operation)),
          response: json({
            kind: result.ack ? "ack" : "conflict",
            value: result.ack ?? result.conflict,
          }),
        },
      });
      return result;
    });
    await cleanupPreparedReceiptBlob(preparedReceipt);
    return result;
  } catch (error) {
    await cleanupPreparedReceiptBlob(preparedReceipt);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await db.accountingSyncOperation.findUnique({
        where: { id: operation.opId },
      });
      if (existing) {
        const result = storedResult(existing.response);
        if (result) return result;
      }
    }
    throw error;
  }
}

function transactionChange(payload: Record<string, unknown>) {
  return {
    legacyId: payload.legacyId ?? null,
    date: payload.date ?? null,
    description: payload.description ?? "",
    debitName: payload.debitName ?? null,
    debitAccount: payload.debitAccount ?? null,
    creditName: payload.creditName ?? null,
    creditAccount: payload.creditAccount ?? null,
    beloppExMoms: payload.beloppExMoms ?? payload.amountExVat ?? null,
    moms: payload.moms ?? payload.vatAmount ?? null,
    momsAccount: payload.momsAccount ?? payload.vatAccount ?? null,
    amount: payload.amount ?? null,
    type: payload.type ?? null,
    source: payload.source ?? null,
    notes: payload.notes ?? "",
    status: payload.status ?? null,
    receiptRequired: payload.receiptRequired ?? true,
    createdAt: payload.createdAt ?? null,
    updatedAt: payload.updatedAt ?? null,
    deletedAt: payload.deletedAt ?? null,
  };
}

export function changeData(entityType: string, value: Prisma.JsonValue) {
  const payload =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  if (entityType === "transaction") return transactionChange(payload);
  if (entityType === "account") {
    return {
      legacyId: payload.legacyId ?? null,
      account: payload.account,
      name: payload.name,
      category: payload.category ?? null,
      deletedAt: payload.deletedAt ?? null,
    };
  }
  return {
    legacyId: payload.legacyId ?? null,
    legacyTransactionId: payload.legacyTransactionId ?? null,
    transactionRemoteId: payload.entryId ?? null,
    filename: payload.originalName ?? "document",
    addedAt: payload.createdAt ?? null,
    size: payload.byteSize ?? null,
    sha256: payload.sha256 ?? null,
    mimeType: payload.mimeType ?? null,
    storageStatus: payload.storageStatus ?? "metadata_only",
    downloadPath:
      payload.storageStatus === "stored"
        ? `/api/accounting/sync/documents/${String(payload.id ?? "")}`
        : null,
    file:
      payload.storageStatus === "stored"
        ? {
            name: payload.originalName ?? "document",
            mimeType: payload.mimeType ?? null,
            size: payload.byteSize ?? null,
            sha256: payload.sha256 ?? null,
          }
        : null,
    deletedAt: payload.deletedAt ?? null,
  };
}

export function isDeliverableSyncAuditEvent(event: {
  entityType: string;
  payload: Prisma.JsonValue;
}) {
  if (!["transaction", "account", "receipt"].includes(event.entityType)) {
    return false;
  }
  if (event.entityType !== "receipt") return true;
  if (
    !event.payload ||
    typeof event.payload !== "object" ||
    Array.isArray(event.payload)
  ) {
    return false;
  }
  const entryId = (event.payload as Record<string, unknown>).entryId;
  return typeof entryId === "string" && entryId.length > 0;
}

export async function synchronizeAccounting(body: unknown, request: Request) {
  const parsed = parseWithSchema(syncRequestSchema, body);
  const rawDeviceId =
    request.headers.get("x-accounting-device-id")?.trim() || "desktop";
  const deviceId =
    rawDeviceId.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 120) || "desktop";
  const db = getAccountingDb();
  await db.accountingSyncDevice.upsert({
    where: { id: deviceId },
    create: {
      id: deviceId,
      name:
        request.headers.get("x-accounting-device-name")?.trim().slice(0, 200) ||
        deviceId,
      appVersion:
        request.headers.get("x-accounting-app-version")?.trim().slice(0, 100) ||
        null,
    },
    update: {
      name:
        request.headers.get("x-accounting-device-name")?.trim().slice(0, 200) ||
        deviceId,
      appVersion:
        request.headers.get("x-accounting-app-version")?.trim().slice(0, 100) ||
        null,
      lastSeenAt: new Date(),
    },
  });

  const acked: Ack[] = [];
  const conflicts: Conflict[] = [];
  for (const operation of parsed.operations) {
    const result = await applyOperation(operation, deviceId);
    if (result.ack) acked.push(result.ack);
    if (result.conflict) conflicts.push(result.conflict);
  }

  const cursor = BigInt(parsed.cursor ?? "0");
  const events = await db.accountingAuditEvent.findMany({
    where: { id: { gt: cursor } },
    orderBy: { id: "asc" },
    take: 500,
  });
  const nextCursor = events.at(-1)?.id ?? cursor;
  const changes = events.filter(isDeliverableSyncAuditEvent).map((event) => ({
    entityType: event.entityType as "transaction" | "account" | "receipt",
    operation: event.operation as "upsert" | "delete",
    remoteId: event.entityId,
    version: event.version,
    data: changeData(event.entityType, event.payload),
  }));

  await db.accountingSyncDevice.update({
    where: { id: deviceId },
    data: { lastSeenAt: new Date(), lastCursor: nextCursor },
  });
  return { cursor: nextCursor.toString(), acked, conflicts, changes };
}
