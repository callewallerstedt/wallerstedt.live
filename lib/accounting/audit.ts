import type { AccountingDocument, Prisma } from "@prisma/client";
import { serializeDocument } from "./serialize";

export function receiptAuditData(
  document: AccountingDocument,
  operation: "upsert" | "delete",
  actor: string,
) {
  return {
    entityType: "receipt",
    entityId: document.id,
    operation,
    version: document.version,
    actor,
    payload: serializeDocument(document) as unknown as Prisma.InputJsonValue,
  } as const;
}

export async function writeReceiptAudit(
  tx: Prisma.TransactionClient,
  document: AccountingDocument,
  operation: "upsert" | "delete",
  actor: string,
) {
  await tx.accountingAuditEvent.create({
    data: receiptAuditData(document, operation, actor),
  });
}
