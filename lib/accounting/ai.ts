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
  aiRevisionRequestSchema,
  entryCreateSchema,
  normalizeEntryInput,
  parseWithSchema,
} from "./validation";

const MAX_AI_TEXT = 50_000;
const MAX_AI_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_AI_TEXT_FILE_BYTES = 500_000;

export type AiInputDocument = {
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

export async function purgeUnattachedAiDocuments(ids: string[], actor: string) {
  const uniqueIds = [...new Set(ids)].slice(0, MAX_DOCUMENTS_PER_REQUEST);
  if (!uniqueIds.length) return { purged: 0, failed: 0 };
  const db = getAccountingDb();
  const purged = await db.$transaction(async (tx) => {
    const newlyDeleted = await tx.accountingDocument.updateManyAndReturn({
      where: {
        id: { in: uniqueIds },
        entryId: null,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
    for (const document of newlyDeleted) {
      await writeReceiptAudit(tx, document, "delete", actor);
    }
    return newlyDeleted.length;
  });
  // Financial evidence is hidden logically but its private Blob is retained.
  // This keeps every previously verified snapshot restorable.
  return { purged, failed: 0 };
}

export async function loadExistingDocuments(
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
        "Extract every distinct accounting transaction from the owner's note and attached documents. " +
        "Bulk input is expected: return one separate draft entry per receipt, invoice, payment, or CSV row; never merge unrelated transactions into one entry. " +
        "When a document contains several transactions, return all of them (up to 50) and preserve their source order. " +
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

function buildRevisionContent(
  instruction: string,
  entries: unknown[],
  documents: AiInputDocument[],
): UserContent {
  const content: Exclude<UserContent, string> = [
    {
      type: "text",
      text:
        "Revise the complete current accounting draft batch according to the owner's instruction. " +
        "Return the complete batch, including unchanged entries. You may update multiple entries, add, remove, or reorder entries only when the instruction requires it. " +
        "Never post anything to the ledger. The owner must review every returned entry again.\n\n" +
        `OWNER'S BATCH EDIT INSTRUCTION:\n${instruction}\n\n` +
        `CURRENT DRAFT BATCH (${entries.length} entries):\n${JSON.stringify(entries, null, 2)}`,
    },
  ];
  appendDocuments(content, documents);
  return content;
}

function appendDocuments(
  content: Exclude<UserContent, string>,
  documents: AiInputDocument[],
) {
  for (const document of documents) {
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
}

function formatAccountList(
  accounts: Array<{ account: number; name: string; category: string | null }>,
) {
  return accounts
    .map(
      (account) =>
        `${account.account} ${account.name}${account.category ? ` (${account.category})` : ""}`,
    )
    .join("\n");
}

function formatLedgerHistory(
  entries: Array<{
    date: Date | null;
    description: string | null;
    debitAccount: number | null;
    debitName: string | null;
    creditAccount: number | null;
    creditName: string | null;
    amountExVat: unknown;
    vatAmount: unknown;
    amount: unknown;
    type: string | null;
  }>,
) {
  if (!entries.length) return "No previous ledger entries are available yet.";
  return entries
    .map((entry) =>
      [
        entry.date?.toISOString().slice(0, 10) ?? "date missing",
        entry.description || "description missing",
        `debit ${entry.debitAccount ?? "?"} ${entry.debitName ?? ""}`.trim(),
        `credit ${entry.creditAccount ?? "?"} ${entry.creditName ?? ""}`.trim(),
        `ex VAT ${entry.amountExVat ?? "?"}`,
        `VAT ${entry.vatAmount ?? "?"}`,
        `total ${entry.amount ?? "?"}`,
        `type ${entry.type ?? "?"}`,
      ].join(" | "),
    )
    .join("\n");
}

async function loadAccountingReferenceContext() {
  const db = getAccountingDb();
  const [accounts, previousEntries] = await Promise.all([
    db.accountingAccount.findMany({
      where: { deletedAt: null },
      orderBy: { account: "asc" },
      select: { account: true, name: true, category: true },
    }),
    db.accountingEntry.findMany({
      where: { deletedAt: null },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 500,
      select: {
        date: true,
        description: true,
        debitAccount: true,
        debitName: true,
        creditAccount: true,
        creditName: true,
        amountExVat: true,
        vatAmount: true,
        amount: true,
        type: true,
      },
    }),
  ]);
  return {
    accountList: formatAccountList(accounts),
    ledgerHistory: formatLedgerHistory(previousEntries),
  };
}

function accountingSystemPrompt(accountList: string, ledgerHistory: string) {
  return `You prepare bookkeeping suggestions for Wallerstedt Productions AB, a Swedish aktiebolag.
Return drafts only. Never claim that anything has been posted, paid, filed, or saved.
Use exact figures and dates visible in the inputs. Use null when evidence is missing.
Each entry needs balanced debit and credit accounts. Prefer an account in the supplied BAS account list.
Set receiptRequired intelligently for every post. Use true when a receipt, invoice, or other supporting attachment is expected; use false only when no supporting document is normally required. A currently missing attachment is not by itself a reason to use false.
For bulk input, identify every distinct transaction and emit a separate entry for each. Do not summarize or combine separate purchases, receipts, invoice lines that are separate postings, payments, or CSV rows.
Use sourceDocumentIndexes on every row so each uploaded document is traceable to the correct proposed entry. If one document contains multiple transactions, reuse its index on each relevant row.
For Swedish deductible VAT, separate total, amount excluding VAT, VAT, and normally use VAT account 2641.
Foreign reverse-charge services require caution; explain uncertainty in warnings and reasoning.
sourceDocumentIndexes are zero-based indexes into the attached documents relevant to that row.
Keep descriptions concise and reasoning in Swedish. Do not provide tax or legal certainty.

Use the previous ledger only as a precedent for the owner's naming and account-selection patterns. Never copy its dates or amounts into a new transaction, and never invent evidence from it. Prefer the same accounts for genuinely similar transactions.

AVAILABLE BAS ACCOUNTS:
${accountList || "No cloud account list has been imported yet."}

PREVIOUS LEDGER ENTRIES, NEWEST FIRST:
${ledgerHistory}`;
}

export async function storeAiDraft(input: {
  model: string;
  inputText: string;
  documentIds: string[];
  ownedDocumentIds: string[];
  extracted: unknown;
}) {
  const draft = await getAccountingDb().accountingAiDraft.create({
    data: {
      status: "pending",
      model: input.model,
      inputText: input.inputText,
      documentIds: json(input.documentIds),
      ownedDocumentIds: json(input.ownedDocumentIds),
      extracted: json(input.extracted),
    },
  });
  return serializeDraft(draft);
}

export async function createAiDraft(request: Request) {
  const input = await parseDraftRequest(request);
  try {
    const { accountList, ledgerHistory } =
      await loadAccountingReferenceContext();
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new AccountingError(
        "OpenAI is not configured. Nothing was added to the ledger.",
        503,
        "openai_not_configured",
      );
    }
    const configuredModel = process.env.ACCOUNTING_AI_MODEL?.trim() || "gpt-5.6-sol";
    const modelId = configuredModel.replace(/^openai\//, "");
    const { generateText, Output } = await import("ai");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey });

    let extracted: unknown;
    try {
      const result = await generateText({
        model: openai(modelId),
        output: Output.object({
          schema: aiExtractionSchema,
          name: "accounting_draft",
          description:
            "One or more Swedish double-entry accounting drafts for owner review",
        }),
        system: accountingSystemPrompt(accountList, ledgerHistory),
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

    return storeAiDraft({
      model: modelId,
      inputText: input.text,
      documentIds: input.documents.map((document) => document.id),
      ownedDocumentIds: input.ownedDocumentIds,
      extracted,
    });
  } catch (error) {
    await purgeUnattachedAiDocuments(
      input.ownedDocumentIds,
      "web-ai-extraction-failed",
    );
    throw error;
  }
}

export async function reviseAiDraft(id: string, value: unknown) {
  const input = parseWithSchema(aiRevisionRequestSchema, value);
  const db = getAccountingDb();
  const draft = await db.accountingAiDraft.findUnique({ where: { id } });
  if (!draft) {
    throw new AccountingError("Draft not found.", 404, "draft_not_found");
  }
  if (draft.status !== "pending") {
    throw new AccountingConflictError(
      "Only a pending AI draft can be revised.",
      { status: draft.status },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AccountingError(
      "OpenAI is not configured. The draft was not changed.",
      503,
      "openai_not_configured",
    );
  }

  const [{ accountList, ledgerHistory }, documents] = await Promise.all([
    loadAccountingReferenceContext(),
    loadExistingDocuments(documentIdsFromJson(draft.documentIds)),
  ]);
  const configuredModel =
    process.env.ACCOUNTING_AI_MODEL?.trim() || "gpt-5.6-sol";
  const modelId = configuredModel.replace(/^openai\//, "");
  const { generateText, Output } = await import("ai");
  const { createOpenAI } = await import("@ai-sdk/openai");
  const openai = createOpenAI({ apiKey });

  let extracted: unknown;
  try {
    const result = await generateText({
      model: openai(modelId),
      output: Output.object({
        schema: aiExtractionSchema,
        name: "revised_accounting_draft_batch",
        description:
          "The complete revised batch of Swedish double-entry accounting drafts for owner review",
      }),
      system:
        accountingSystemPrompt(accountList, ledgerHistory) +
        "\n\nThis is a batch revision. Apply the owner's instruction across the entire current batch and return every resulting entry, including entries that remain unchanged. Do not silently return only one edited entry. Preserve source-document mappings whenever they remain relevant.",
      messages: [
        {
          role: "user",
          content: buildRevisionContent(
            input.instruction,
            input.entries,
            documents,
          ),
        },
      ],
    });
    extracted = result.output;
  } catch (error) {
    console.error(
      "Accounting AI batch revision failed",
      redactedErrorDiagnostic(error),
    );
    throw new AccountingError(
      "AI could not revise the batch. The current draft is unchanged; try again.",
      502,
      "ai_revision_failed",
    );
  }

  return db.$transaction(async (tx) => {
    const claimed = await tx.accountingAiDraft.updateMany({
      where: {
        id,
        status: "pending",
        updatedAt: draft.updatedAt,
      },
      data: {
        model: modelId,
        extracted: json(extracted),
      },
    });
    if (claimed.count !== 1) {
      throw new AccountingConflictError(
        "This draft changed while AI was working. Reload it before trying again.",
        { reason: "draft_revision_conflict" },
      );
    }
    await tx.accountingAuditEvent.create({
      data: {
        entityType: "ai_draft",
        entityId: id,
        operation: "revise",
        version: 1,
        actor: "web",
        payload: json({
          instruction: input.instruction,
          previousEntryCount: input.entries.length,
          model: modelId,
        }),
      },
    });
    const revised = await tx.accountingAiDraft.findUnique({ where: { id } });
    if (!revised) {
      throw new AccountingError("Draft not found.", 404, "draft_not_found");
    }
    return serializeDraft(revised);
  });
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
          unusedOwnedDocumentPolicy: "soft-delete-unattached-retain-blob",
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
          documentPolicy: "soft_delete_unattached_retain_blob",
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
