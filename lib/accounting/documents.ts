import { createHash, randomUUID } from "node:crypto";
import type { AccountingDocument } from "@prisma/client";
import { writeReceiptAudit } from "./audit";
import { getAccountingDb } from "./db";
import { AccountingError } from "./errors";
import { serializeDocument } from "./serialize";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_REQUEST = 8;
const MAX_TOTAL_DOCUMENT_BYTES = 40 * 1024 * 1024;

export type SniffedDocument = {
  buffer: Buffer;
  originalName: string;
  mimeType:
    "application/pdf" | "image/jpeg" | "image/png" | "text/plain" | "text/csv";
  extension: ".pdf" | ".jpg" | ".png" | ".txt" | ".csv";
  sha256: string;
};

export type StoredPrivateBlob = {
  pathname: string;
  url: string;
};

function cleanFilename(value: string) {
  const base = value.replace(/\\/g, "/").split("/").pop() || "document";
  const cleaned = base
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"/\\|?*]/g, "-")
    .trim()
    .slice(0, 180);
  return cleaned || "document";
}

function isPng(buffer: Buffer) {
  return (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  );
}

function isJpeg(buffer: Buffer) {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

function isPdf(buffer: Buffer) {
  return (
    buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-"
  );
}

function isSafeText(buffer: Buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

export async function inspectDocument(file: File): Promise<SniffedDocument> {
  if (!(file instanceof Blob)) {
    throw new AccountingError(
      "A document file is required.",
      400,
      "file_required",
    );
  }
  if (file.size <= 0) {
    throw new AccountingError(
      "Empty documents are not allowed.",
      400,
      "empty_file",
    );
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new AccountingError(
      "Each document must be 10 MB or smaller.",
      413,
      "file_too_large",
    );
  }

  const originalName = cleanFilename(file.name || "document");
  const lowerName = originalName.toLocaleLowerCase("en");
  const buffer = Buffer.from(await file.arrayBuffer());
  let mimeType: SniffedDocument["mimeType"];
  let extension: SniffedDocument["extension"];

  if (isPdf(buffer)) {
    mimeType = "application/pdf";
    extension = ".pdf";
  } else if (isJpeg(buffer)) {
    mimeType = "image/jpeg";
    extension = ".jpg";
  } else if (isPng(buffer)) {
    mimeType = "image/png";
    extension = ".png";
  } else if (isSafeText(buffer)) {
    const csv =
      lowerName.endsWith(".csv") ||
      file.type.toLocaleLowerCase("en") === "text/csv" ||
      file.type.toLocaleLowerCase("en") === "application/csv";
    const text =
      lowerName.endsWith(".txt") ||
      file.type.toLocaleLowerCase("en") === "text/plain";
    if (!csv && !text) {
      throw new AccountingError(
        "Text documents must use a .txt or .csv filename.",
        415,
        "unsupported_file_type",
      );
    }
    mimeType = csv ? "text/csv" : "text/plain";
    extension = csv ? ".csv" : ".txt";
  } else {
    throw new AccountingError(
      "Only PDF, JPEG, PNG, text, and CSV documents are allowed.",
      415,
      "unsupported_file_type",
    );
  }

  const declared = file.type.toLocaleLowerCase("en");
  const declaredCompatible =
    !declared ||
    declared === "application/octet-stream" ||
    declared === mimeType ||
    (mimeType === "image/jpeg" && declared === "image/jpg") ||
    (mimeType === "text/csv" &&
      ["application/csv", "application/vnd.ms-excel"].includes(declared));
  if (!declaredCompatible) {
    throw new AccountingError(
      "The document contents do not match its declared file type.",
      415,
      "file_type_mismatch",
    );
  }

  return {
    buffer,
    originalName,
    mimeType,
    extension,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

export async function inspectDocumentBytes(
  originalName: string,
  declaredMimeType: string,
  buffer: Buffer,
) {
  const bytes = Uint8Array.from(buffer);
  const file = new File([bytes], cleanFilename(originalName), {
    type: declaredMimeType,
  });
  return inspectDocument(file);
}

export async function putPrivateDocumentBlob(
  inspected: SniffedDocument,
  id: string,
  version = 1,
): Promise<StoredPrivateBlob> {
  const versionSuffix = version > 1 ? `-v${version}` : "";
  const pathname = `accounting/documents/${id}${versionSuffix}${inspected.extension}`;
  const { put } = await import("@vercel/blob");
  const blob = await put(pathname, inspected.buffer, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: inspected.mimeType,
    cacheControlMaxAge: 60,
  });
  return { pathname: blob.pathname, url: blob.url };
}

export function filesFromForm(form: FormData) {
  const values = [...form.getAll("files"), ...form.getAll("file")];
  const files = values.filter((value): value is File => value instanceof File);
  if (!files.length) {
    throw new AccountingError(
      "At least one document is required.",
      400,
      "file_required",
    );
  }
  if (files.length > MAX_DOCUMENTS_PER_REQUEST) {
    throw new AccountingError(
      `Upload at most ${MAX_DOCUMENTS_PER_REQUEST} documents at once.`,
      400,
      "too_many_files",
    );
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_TOTAL_DOCUMENT_BYTES) {
    throw new AccountingError(
      "The combined upload is too large.",
      413,
      "upload_too_large",
    );
  }
  return files;
}

export async function uploadInspectedDocument(
  inspected: SniffedDocument,
  entryId: string | null,
  actor = "web",
  deduplicate = true,
) {
  const db = getAccountingDb();
  if (entryId) {
    const entry = await db.accountingEntry.findFirst({
      where: { id: entryId, deletedAt: null },
    });
    if (!entry)
      throw new AccountingError("Entry not found.", 404, "entry_not_found");
  }

  if (deduplicate) {
    const duplicate = await db.accountingDocument.findFirst({
      where: {
        entryId,
        sha256: inspected.sha256,
        deletedAt: null,
        storageStatus: "stored",
      },
    });
    if (duplicate) return duplicate;
  }

  const id = randomUUID();
  const { del } = await import("@vercel/blob");
  const blob = await putPrivateDocumentBlob(inspected, id);

  try {
    return await db.$transaction(async (tx) => {
      const document = await tx.accountingDocument.create({
        data: {
          id,
          entryId,
          originalName: inspected.originalName,
          blobPathname: blob.pathname,
          blobUrl: blob.url,
          sha256: inspected.sha256,
          byteSize: inspected.buffer.byteLength,
          mimeType: inspected.mimeType,
          storageStatus: "stored",
        },
      });
      await writeReceiptAudit(tx, document, "upsert", actor);
      return document;
    });
  } catch (error) {
    await del(blob.pathname).catch(() => undefined);
    throw error;
  }
}

export async function uploadDocuments(
  files: File[],
  entryId: string | null,
  actor = "web",
) {
  const inspected = await Promise.all(files.map(inspectDocument));
  const documents = [];
  for (const item of inspected) {
    documents.push(await uploadInspectedDocument(item, entryId, actor));
  }
  return documents;
}

export async function listDocuments(entryId?: string | null) {
  const rows = await getAccountingDb().accountingDocument.findMany({
    where: {
      deletedAt: null,
      ...(entryId ? { entryId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  });
  return rows.map(serializeDocument);
}

export async function getStoredDocument(id: string) {
  const document = await getAccountingDb().accountingDocument.findUnique({
    where: { id },
  });
  if (
    !document ||
    document.deletedAt ||
    !document.blobPathname ||
    document.storageStatus !== "stored"
  ) {
    throw new AccountingError("Document not found.", 404, "document_not_found");
  }
  return document;
}

export async function readPrivateDocument(document: AccountingDocument) {
  if (!document.blobPathname) {
    throw new AccountingError(
      "Document content is unavailable.",
      404,
      "document_unavailable",
    );
  }
  const { get } = await import("@vercel/blob");
  const result = await get(document.blobPathname, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new AccountingError(
      "Document content is unavailable.",
      404,
      "document_unavailable",
    );
  }
  return result;
}

export function contentDisposition(filename: string, inline = false) {
  const ascii = cleanFilename(filename)
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
