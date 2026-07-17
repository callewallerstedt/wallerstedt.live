import { createHash } from "node:crypto";
import type { HandleUploadBody } from "@vercel/blob/client";
import { writeReceiptAudit } from "./audit";
import { assertAccessKey, requireOwnerSession, requireSyncToken } from "./auth";
import { getAccountingDb } from "./db";
import {
  inspectDocumentBytes,
  MAX_DOCUMENT_BYTES,
  type SniffedDocument,
  type StoredPrivateBlob,
} from "./documents";
import { AccountingError } from "./errors";
import { parseJson, privateJson } from "./http";

export const ACCOUNTING_UPLOAD_PREFIX = "accounting-documents/";
const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
  "text/csv",
  "application/csv",
];
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "txt", "csv"]);

export type ClientBlobReference = {
  pathname: string;
  url: string;
  downloadUrl?: string | null;
  etag?: string | null;
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
};

export type VerifiedClientBlob = {
  blob: StoredPrivateBlob;
  inspected: SniffedDocument;
  etag: string;
};

export function assertAccountingUploadPath(pathname: string) {
  if (
    !pathname.startsWith(ACCOUNTING_UPLOAD_PREFIX) ||
    pathname.length > 240 ||
    pathname.includes("..") ||
    pathname.includes("\\") ||
    !/^accounting-documents\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(pathname)
  ) {
    throw new AccountingError(
      "Invalid accounting upload pathname.",
      400,
      "invalid_upload_path",
    );
  }
  const extension = pathname.split(".").pop()?.toLocaleLowerCase("en") ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new AccountingError(
      "Unsupported accounting document extension.",
      415,
      "unsupported_file_type",
    );
  }
}

function isCompletion(
  body: unknown,
): body is { type: "blob.upload-completed" } {
  return Boolean(
    body &&
    typeof body === "object" &&
    (body as { type?: unknown }).type === "blob.upload-completed",
  );
}

async function blobHandleUpload(request: Request, body: HandleUploadBody) {
  const { handleUpload } = await import("@vercel/blob/client");
  return handleUpload({
    request,
    body,
    onBeforeGenerateToken: async (pathname) => {
      assertAccountingUploadPath(pathname);
      return {
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: MAX_DOCUMENT_BYTES,
        validUntil: Date.now() + 10 * 60 * 1000,
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 60,
        callbackUrl: request.url,
        tokenPayload: JSON.stringify({
          pathname,
          purpose: "accounting-document",
        }),
      };
    },
    onUploadCompleted: async () => {
      // Completion is intentionally side-effect free. Finalization re-verifies the private blob.
    },
  });
}

export async function handleOwnerUploadToken(
  request: Request,
  accessKey: string,
) {
  assertAccessKey(accessKey);
  const body = (await parseJson(request, 64_000)) as HandleUploadBody;
  if (!isCompletion(body)) await requireOwnerSession(request, accessKey, true);
  return privateJson(await blobHandleUpload(request, body));
}

export async function handleSyncUploadToken(request: Request) {
  const body = (await parseJson(request, 64_000)) as HandleUploadBody;
  if (!isCompletion(body)) requireSyncToken(request);
  return privateJson(await blobHandleUpload(request, body));
}

export async function verifyPrivateBlobReference(
  reference: ClientBlobReference,
): Promise<VerifiedClientBlob> {
  assertAccountingUploadPath(reference.pathname);
  if (
    !Number.isInteger(reference.size) ||
    reference.size <= 0 ||
    reference.size > MAX_DOCUMENT_BYTES ||
    !/^[a-fA-F0-9]{64}$/.test(reference.sha256)
  ) {
    throw new AccountingError(
      "Invalid uploaded document metadata.",
      400,
      "invalid_blob_metadata",
    );
  }
  const { BlobNotFoundError, get, head } = await import("@vercel/blob");
  let metadata;
  try {
    metadata = await head(reference.pathname);
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error;
    throw new AccountingError(
      "Uploaded document was not found.",
      400,
      "blob_not_found",
    );
  }
  if (
    metadata.pathname !== reference.pathname ||
    metadata.url !== reference.url ||
    metadata.size !== reference.size ||
    (reference.etag && metadata.etag !== reference.etag)
  ) {
    throw new AccountingError(
      "Uploaded document metadata did not verify.",
      400,
      "blob_metadata_mismatch",
    );
  }
  const result = await get(reference.pathname, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new AccountingError(
      "Uploaded document could not be verified.",
      503,
      "blob_unavailable",
    );
  }
  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  if (
    buffer.byteLength !== reference.size ||
    buffer.byteLength > MAX_DOCUMENT_BYTES
  ) {
    throw new AccountingError(
      "Uploaded document size did not verify.",
      400,
      "blob_size_mismatch",
    );
  }
  const inspected = await inspectDocumentBytes(
    reference.name,
    reference.mimeType,
    buffer,
  );
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (
    sha256 !== inspected.sha256 ||
    sha256.toLocaleLowerCase("en") !== reference.sha256.toLocaleLowerCase("en")
  ) {
    throw new AccountingError(
      "Uploaded document checksum did not verify.",
      400,
      "blob_checksum_mismatch",
    );
  }
  if (
    metadata.contentType !== inspected.mimeType &&
    reference.mimeType !== inspected.mimeType
  ) {
    throw new AccountingError(
      "Uploaded document type did not verify.",
      415,
      "blob_type_mismatch",
    );
  }
  return {
    blob: { pathname: metadata.pathname, url: metadata.url },
    inspected,
    etag: metadata.etag,
  };
}

export async function finalizeClientDocument(
  reference: ClientBlobReference,
  entryId: string | null,
  actor = "web",
) {
  const verified = await verifyPrivateBlobReference(reference);
  const db = getAccountingDb();
  return db.$transaction(async (tx) => {
    if (entryId) {
      const entry = await tx.accountingEntry.findFirst({
        where: { id: entryId, deletedAt: null },
      });
      if (!entry)
        throw new AccountingError("Entry not found.", 404, "entry_not_found");
    }
    const existing = await tx.accountingDocument.findUnique({
      where: { blobPathname: verified.blob.pathname },
    });
    if (existing) return existing;
    const document = await tx.accountingDocument.create({
      data: {
        entryId,
        originalName: verified.inspected.originalName,
        blobPathname: verified.blob.pathname,
        blobUrl: verified.blob.url,
        sha256: verified.inspected.sha256,
        byteSize: verified.inspected.buffer.byteLength,
        mimeType: verified.inspected.mimeType,
        storageStatus: "stored",
      },
    });
    await writeReceiptAudit(tx, document, "upsert", actor);
    return document;
  });
}
