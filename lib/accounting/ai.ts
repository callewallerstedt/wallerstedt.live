import type { Prisma } from "@prisma/client";
import type { UserContent } from "ai";
import { writeReceiptAudit } from "./audit";
import { getAccountingDb } from "./db";
import {
  inspectDocument,
  MAX_DOCUMENTS_PER_REQUEST,
  readPrivateDocument,
  uploadInspectedDocument,
} from "./documents";
import {
  AccountingConflictError,
  AccountingError,
  redactedErrorDiagnostic,
} from "./errors";
import { parseJson } from "./http";
import { serializeDraft, serializeEntry } from "./serialize";
import { createEntryInTransaction } from "./service";
import {
  aiExtractionSchema,
  entryCreateSchema,
  normalizeEntryInput,
  parseWithSchema,
} from "./validation";

const MAX_AI_TEXT = 50_000;
const MAX_AI_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_AI_TEXT_FILE_BYTES = 500_000;

type AiInputDocument = {
  id: string;
  name: string;
  mimeType: string;
  buffer: Buffer;
};

type DraftRequest = {
  text: string;
  documents: AiInputDocument[];
  ownedDocumentIds: string[];
};

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function documentIdsFromJson(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, MAX_DOCUMENTS_PER_REQUEST);
}

export function unusedOwnedDocumentIds(
  ownedDocumentIds: string[],
  attachedDocumentIds: Iterable<string>,
) {
  const attached = new Set(attachedDocumentIds);
  return [...new Set(ownedDocumentIds)].filter(
    (documentId) => !attached.has(documentId),
  );
}

async function purgeUnattachedAiDocuments(ids: string[], actor: string) {
  const uniqueIds = [...new Set(ids)].slice(0, MAX_DOCUMENTS_PER_REQUEST);
  if (!uniqueIds.length) return { purged: 0, failed: 0 };
  const db = getAccountingDb();
  const rows = await db.$transaction(async (tx) => {
    const newlyDeleted = await tx.accountingDocument.updateManyAndReturn({
      where: {
        id: { in: uniqueIds },
        entryId: null,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        storageStatus: "purging",
        version: { increment: 1 },
      },
    });
    for (const document of newlyDeleted) {
      await writeReceiptAudit(tx, document, "delete", actor);
    }
    const retryable = await tx.accountingDocument.findMany({
      where: {
        id: { in: uniqueIds },
        entryId: null,
        deletedAt: { not: null },
        blobPathname: { not: null },
        storageStatus: { in: ["purging", "delete_failed"] },
      },
    });
    return retryable;
  });

  let purged = 0;
  let failed = 0;
  const { del } = await import("@vercel/blob");
  for (const document of rows) {
    try {
      await del(document.blobPathname!);
      await db.accountingDocument.updateMany({
        where: {
          id: document.id,
          entryId: null,
          deletedAt: { not: null },
        },
        data: {
          blobPathname: null,
          blobUrl: null,
          storageStatus: "purged",
        },
      });
      purged += 1;
    } catch (error) {
      failed += 1;
      await db.accountingDocument
        .updateMany({
          where: { id: document.id, entryId: null },
          data: { storageStatus: "delete_failed" },
        })
        .catch(() => undefined);
      console.error(
        "Accounting AI document cleanup failed",
        redactedErrorDiagnostic(error),
      );
    }
  }
  return { purged, failed };
}

async function loadExistingDocuments(
  ids: string[],
): Promise<AiInputDocument[]> {
  if (!ids.length) return [];
  const db = getAccountingDb();
  const rows = await db.accountingDocument.findMany({
    where: { id: { in: ids }, deletedAt: null, storageStatus: "stored" },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const result: AiInputDocument[] = [];
  let total = 0;
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      throw new AccountingError(
        "A selected document was not found.",
        404,
        "document_not_found",
      );
    }
    const blob = await readPrivateDocument(row);
    const buffer = Buffer.from(await new Response(blob.stream).arrayBuffer());
    total += buffer.byteLength;
    if (total > MAX_AI_TOTAL_BYTES) {
      throw new AccountingError(
        "AI input documents are too large.",
        413,
        "ai_input_too_large",
      );
    }
    result.push({
      id: row.id,
      name: row.originalName,
      mimeType: row.mimeType ?? blob.blob.contentType,
      buffer,
    });
  }
  return result;
}

async function parseMultipartDraft(request: Request): Promise<DraftRequest> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new AccountingError("Invalid multipart form.", 400, "invalid_form");
  }
  const textValue = form.get("text");
  const text =
    typeof textValue === "string" ? textValue.trim().slice(0, MAX_AI_TEXT) : "";
  const files = [...form.getAll("files"), ...form.getAll("file")].filter(
    (item): item is File => item instanceof File,
  );
  if (files.length > MAX_DOCUMENTS_PER_REQUEST) {
    throw new AccountingError(
      "Too many AI input documents.",
      400,
      "too_many_files",
    );
  }
  const documents: AiInputDocument[] = [];
  const ownedDocumentIds: string[] = [];
  let total = 0;
  try {
    for (const file of files) {
      const inspected = await inspectDocument(file);
      total += inspected.buffer.byteLength;
      if (total > MAX_AI_TOTAL_BYTES) {
        throw new AccountingError(
          "AI input documents are too large.",
          413,
          "ai_input_too_large",
        );
      }
      const stored = await uploadInspectedDocument(
        inspected,
        null,
        "web-ai-upload",
        false,
      );
      ownedDocumentIds.push(stored.id);
      documents.push({
        id: stored.id,
        name: stored.originalName,
        mimeType: stored.mimeType ?? inspected.mimeType,
        buffer: inspected.buffer,
      });
    }
    const rawDocumentIds = form.get("documentIds");
    let parsedDocumentIds: unknown = [];
    if (typeof rawDocumentIds === "string" && rawDocumentIds.trim()) {
      try {
        parsedDocumentIds = JSON.parse(rawDocumentIds);
      } catch {
        throw new AccountingError(
          "Invalid documentIds value.",
          400,
          "invalid_document_ids",
        );
      }
    }
    const existingIds = documentIdsFromJson(parsedDocumentIds);
    const existingDocuments = await loadExistingDocuments(existingIds);
    if (
      documents.length + existingDocuments.length >
      MAX_DOCUMENTS_PER_REQUEST
    ) {
      throw new AccountingError(
        `Upload or select at most ${MAX_DOCUMENTS_PER_REQUEST} documents in total.`,
        400,
        "too_many_files",
      );
    }
    documents.push(...existingDocuments);
    const combinedBytes = documents.reduce(
      (sum, document) => sum + document.buffer.byteLength,
      0,
    );
    if (combinedBytes > MAX_AI_TOTAL_BYTES) {
      throw new AccountingError(
        "AI input documents are too large.",
        413,
        "ai_input_too_large",
      );
    }
    if (
      documents.some(
        (document) =>
          ["text/plain", "text/csv"].includes(document.mimeType) &&
          document.buffer.byteLength > MAX_AI_TEXT_FILE_BYTES,
      )
    ) {
      throw new AccountingError(
        "Text and CSV inputs must be 500 KB or smaller for AI extraction.",
        413,
        "ai_text_input_too_large",
      );
    }
    return {
      text,
      documents,
      ownedDocumentIds,
    };
  } catch (error) {
    await purgeUnattachedAiDocuments(ownedDocumentIds, "web-ai-upload-failed");
    throw error;
  }
}

async function parseDraftRequest(request: Request): Promise<DraftRequest> {
  const contentType =
    request.headers.get("content-type")?.toLocaleLowerCase("en") ?? "";
  const value = contentType.includes("multipart/form-data")
    ? await parseMultipartDraft(request)
    : await (async () => {
        const body = await parseJson(request, 300_000);
        const object =
          body && typeof body === "object"
            ? (body as Record<string, unknown>)
            : {};
        const text =
          typeof object.text === "string"
            ? object.text.trim().slice(0, MAX_AI_TEXT)
            : "";
        const requestedDocumentIds = documentIdsFromJson(object.documentIds);
        const requestedOwnedIds = documentIdsFromJson(object.ownedDocumentIds);
        if (requestedOwnedIds.some((id) => !requestedDocumentIds.includes(id))) {
          throw new AccountingError(
            "Owned AI documents must also be selected for this draft.",
            400,
            "invalid_owned_document_ids",
          );
        }
        try {
          const documents = await loadExistingDocuments(requestedDocumentIds);
          if (
            documents.some(
              (document) =>
                ["text/plain", "text/csv"].includes(document.mimeType) &&
                document.buffer.byteLength > MAX_AI_TEXT_FILE_BYTES,
            )
          ) {
            throw new AccountingError(
              "Text and CSV inputs must be 500 KB or smaller for AI extraction.",
              413,
              "ai_text_input_too_large",
            );
          }
          return { text, documents, ownedDocumentIds: requestedOwnedIds };
        } catch (error) {
          await purgeUnattachedAiDocuments(
            requestedOwnedIds,
            "web-ai-document-read-failed",
          );
          throw error;
        }
      })();
  if (!value.text && !value.documents.length) {
    throw new AccountingError(
      "Add text, a screenshot, a PDF, or another supported document.",
      400,
      "ai_input_required",
    );
  }
  return value;
}

function buildUserContent(input: DraftRequest): UserContent {
  const content: Exclude<UserContent, string> = [
    {
      type: "text",
      text:
        "Extract draft accounting entries from the owner's note and attached documents. " +
        "Do not invent missing values. The owner will review every result before saving.\n\n" +
        `OWNER NOTE:\n${input.text || "(No typed note; use the attached documents.)"}`,
    },
  ];
  for (const document of input.documents) {
    if (
      document.mimeType === "image/jpeg" ||
      document.mimeType === "image/png"
    ) {
      content.push({
        type: "image",
        image: document.buffer,
        mediaType: document.mimeType,
      });
    } else if (
      document.mimeType === "text/plain" ||
      document.mimeType === "text/csv"
    ) {
      content.push({
        type: "text",
        text:
          `ATTACHED ${document.mimeType === "text/csv" ? "CSV" : "TEXT"} FILE ` +
          `${document.name}:\n${document.buffer.toString("utf8")}`,
      });
    } else {
      content.push({
        type: "file",
        data: document.buffer,
        mediaType: document.mimeType,
        filename: document.name,
      });
    }
  }
  return content;
}

export async function createAiDraft(request: Request) {
  const input = await parseDraftRequest(request);
  try {
    const db = getAccountingDb();
    const accounts = await db.accountingAccount.findMany({
      where: { deletedAt: null },
      orderBy: { account: "asc" },
    });
    const accountList = accounts
      .map(
        (account) =>
          `${account.account} ${account.name}${account.category ? ` (${account.category})` : ""}`,
      )
      .join("\n");
    const model = process.env.ACCOUNTING_AI_MODEL?.trim() || "openai/gpt-5.4";
    const { generateText, Output } = await import("ai");

    let extracted: unknown;
    try {
      const result = await generateText({
        model,
        output: Output.object({
          schema: aiExtractionSchema,
          name: "accounting_draft",
          description:
            "One or more Swedish double-entry accounting drafts for owner review",
        }),
        system: `You extract bookkeeping suggestions for Wallerstedt Productions AB, a Swedish aktiebolag.
Return drafts only. Never claim that anything has been posted, paid, filed, or saved.
Use exact figures and dates visible in the inputs. Use null when evidence is missing.
Each entry needs balanced debit and credit accounts. Prefer an account in the supplied BAS account list.
For Swedish deductible VAT, separate total, amount excluding VAT, VAT, and normally use VAT account 2641.
Foreign reverse-charge services require caution; explain uncertainty in warnings and reasoning.
sourceDocumentIndexes are zero-based indexes into the attached documents relevant to that row.
Keep descriptions concise and reasoning in Swedish. Do not provide tax or legal certainty.

AVAILABLE BAS ACCOUNTS:
${accountList || "No cloud account list has been imported yet."}`,
        messages: [{ role: "user", content: buildUserContent(input) }],
      });
      extracted = result.output;
    } catch (error) {
      console.error(
        "Accounting AI extraction failed",
        redactedErrorDiagnostic(error),
      );
      throw new AccountingError(
        "AI extraction failed. Nothing was added to the ledger; try again or enter the row manually.",
        502,
        "ai_extraction_failed",
      );
    }

    const draft = await db.accountingAiDraft.create({
      data: {
        status: "pending",
        model,
        inputText: input.text,
        documentIds: json(input.documents.map((document) => document.id)),
        ownedDocumentIds: json(input.ownedDocumentIds),
        extracted: json(extracted),
      },
    });
    return serializeDraft(draft);
  } catch (error) {
    await purgeUnattachedAiDocuments(
      input.ownedDocumentIds,
      "web-ai-extraction-failed",
    );
    throw error;
  }
}

export async function getAiDraft(id: string) {
  const draft = await getAccountingDb().accountingAiDraft.findUnique({
    where: { id },
  });
  if (!draft)
    throw new AccountingError("Draft not found.", 404, "draft_not_found");
  return serializeDraft(draft);
}

export async function listAiDrafts() {
  const drafts = await getAccountingDb().accountingAiDraft.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return drafts.map(serializeDraft);
}

function sourceDocumentIds(raw: unknown, draftDocumentIds: string[]) {
  if (!raw || typeof raw !== "object") return [];
  const object = raw as Record<string, unknown>;
  const explicit = documentIdsFromJson(object.documentIds);
  if (explicit.length)
    return explicit.filter((id) => draftDocumentIds.includes(id));
  if (!Array.isArray(object.sourceDocumentIndexes)) return [];
  return object.sourceDocumentIndexes
    .filter((index): index is number => Number.isInteger(index) && index >= 0)
    .map((index) => draftDocumentIds[index])
    .filter((id): id is string => Boolean(id));
}

export async function approveAiDraft(id: string, value: unknown) {
  const object =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  if (
    !Array.isArray(object.entries) ||
    !object.entries.length ||
    object.entries.length > 50
  ) {
    throw new AccountingError(
      "Review and submit at least one draft row.",
      400,
      "approval_entries_required",
    );
  }
  const rawEntries = object.entries;
  const parsedEntries = rawEntries.map((entry) =>
    normalizeEntryInput(parseWithSchema(entryCreateSchema, entry)),
  );
  const db = getAccountingDb();
  const result = await db.$transaction(async (tx) => {
    const draft = await tx.accountingAiDraft.findUnique({ where: { id } });
    if (!draft)
      throw new AccountingError("Draft not found.", 404, "draft_not_found");
    if (draft.status !== "pending") {
      throw new AccountingConflictError(
        "This AI draft has already been reviewed.",
        {
          status: draft.status,
        },
      );
    }
    const claimed = await tx.accountingAiDraft.updateMany({
      where: { id, status: "pending" },
      data: { status: "approving" },
    });
    if (claimed.count !== 1) {
      throw new AccountingConflictError(
        "This AI draft is already being reviewed.",
        { status: "approving" },
      );
    }
    const draftDocumentIds = documentIdsFromJson(draft.documentIds);
    const ownedDocumentIds = documentIdsFromJson(draft.ownedDocumentIds);
    const uniqueDraftDocumentIds = [...new Set(draftDocumentIds)];
    const draftDocuments = uniqueDraftDocumentIds.length
      ? await tx.accountingDocument.findMany({
          where: {
            id: { in: uniqueDraftDocumentIds },
            deletedAt: null,
            storageStatus: "stored",
          },
          select: { id: true, entryId: true },
        })
      : [];
    if (draftDocuments.length !== uniqueDraftDocumentIds.length) {
      throw new AccountingConflictError(
        "One or more draft documents are no longer available. Nothing was posted.",
        { reason: "draft_document_unavailable" },
      );
    }
    const documentById = new Map(draftDocuments.map((document) => [document.id, document]));
    if (
      ownedDocumentIds.some(
        (documentId) => !documentById.has(documentId) || documentById.get(documentId)?.entryId,
      )
    ) {
      throw new AccountingConflictError(
        "An uploaded draft document changed before approval. Nothing was posted.",
        { reason: "owned_draft_document_changed" },
      );
    }
    const attachableIds = new Set(
      draftDocuments
        .filter((document) => !document.entryId)
        .map((document) => document.id),
    );
    const documentAssignments = parsedEntries.map(() => new Set<string>());
    const assignedIds = new Set<string>();
    if (parsedEntries.length === 1) {
      for (const documentId of attachableIds) {
        documentAssignments[0].add(documentId);
        assignedIds.add(documentId);
      }
    } else {
      for (let index = 0; index < rawEntries.length; index += 1) {
        for (const documentId of sourceDocumentIds(rawEntries[index], draftDocumentIds)) {
          if (attachableIds.has(documentId) && !assignedIds.has(documentId)) {
            documentAssignments[index].add(documentId);
            assignedIds.add(documentId);
          }
        }
      }
      // Preserve evidence even when AI/user mappings are absent or edited away.
      for (const documentId of attachableIds) {
        if (!assignedIds.has(documentId)) {
          documentAssignments[0].add(documentId);
          assignedIds.add(documentId);
        }
      }
    }
    const attachedDocumentIds = new Set<string>();
    const entries = [];
    for (let index = 0; index < parsedEntries.length; index += 1) {
      const entry = await createEntryInTransaction(
        tx,
        parsedEntries[index],
        "web-ai-approved",
        {
          action: "ai_approve",
        },
      );
      entries.push(entry);
      const ids = [...documentAssignments[index]];
      if (ids.length) {
        const attachedDocuments =
          await tx.accountingDocument.updateManyAndReturn({
            where: { id: { in: ids }, entryId: null, deletedAt: null },
            data: { entryId: entry.id, version: { increment: 1 } },
          });
        if (attachedDocuments.length !== ids.length) {
          throw new AccountingConflictError(
            "A draft document changed during approval. Nothing was posted.",
            { reason: "draft_document_attach_conflict" },
          );
        }
        for (const document of attachedDocuments) {
          attachedDocumentIds.add(document.id);
          await writeReceiptAudit(tx, document, "upsert", "web-ai-approved");
        }
      }
    }
    const approvedAt = new Date();
    await tx.accountingAiDraft.update({
      where: { id },
      data: {
        status: "approved",
        approvedAt,
        entryId: entries[0]?.id ?? null,
      },
    });
    await tx.accountingAuditEvent.create({
      data: {
        entityType: "ai_draft",
        entityId: id,
        operation: "approve",
        version: 1,
        actor: "web",
        payload: json({
          entryIds: entries.map((entry) => entry.id),
          approvedAt: approvedAt.toISOString(),
          unusedOwnedDocumentPolicy: "preserve-or-purge-only-if-unattached",
        }),
      },
    });
    return {
      entries: entries.map(serializeEntry),
      unusedOwnedDocumentIds: unusedOwnedDocumentIds(
        ownedDocumentIds,
        attachedDocumentIds,
      ),
    };
  });
  await purgeUnattachedAiDocuments(
    result.unusedOwnedDocumentIds,
    "web-ai-approved-unused",
  );
  return result.entries;
}

export async function rejectAiDraft(id: string) {
  const db = getAccountingDb();
  const result = await db.$transaction(async (tx) => {
    const draft = await tx.accountingAiDraft.findUnique({ where: { id } });
    if (!draft)
      throw new AccountingError("Draft not found.", 404, "draft_not_found");
    if (draft.status !== "pending") {
      throw new AccountingConflictError(
        "This AI draft has already been reviewed.",
        {
          status: draft.status,
        },
      );
    }
    const rejectedAt = new Date();
    const rejected = await tx.accountingAiDraft.update({
      where: { id },
      data: { status: "rejected", rejectedAt },
    });
    await tx.accountingAuditEvent.create({
      data: {
        entityType: "ai_draft",
        entityId: id,
        operation: "reject",
        version: 1,
        actor: "web",
        payload: json({
          rejectedAt: rejectedAt.toISOString(),
          ownedDocuments: documentIdsFromJson(draft.ownedDocumentIds).length,
          documentPolicy: "purge_unattached_owned_uploads",
        }),
      },
    });
    return {
      draft: serializeDraft(rejected),
      ownedDocumentIds: documentIdsFromJson(draft.ownedDocumentIds),
    };
  });
  await purgeUnattachedAiDocuments(result.ownedDocumentIds, "web-ai-rejected");
  return result.draft;
}

export async function purgeRejectedAiDraftDocuments(id: string) {
  const draft = await getAccountingDb().accountingAiDraft.findUnique({
    where: { id },
  });
  if (!draft)
    throw new AccountingError("Draft not found.", 404, "draft_not_found");
  if (draft.status !== "rejected") {
    throw new AccountingConflictError(
      "Only a rejected draft can have its owned uploads purged.",
      { status: draft.status },
    );
  }
  return purgeUnattachedAiDocuments(
    documentIdsFromJson(draft.ownedDocumentIds),
    "web-ai-rejected-purge",
  );
}
