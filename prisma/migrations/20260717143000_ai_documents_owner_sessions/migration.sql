-- AlterTable
ALTER TABLE "AccountingAiDraft" ADD COLUMN     "ownedDocumentIds" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "AccountingOwnerSession" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingOwnerSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingOwnerSession_expiresAt_idx" ON "AccountingOwnerSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AccountingOwnerSession_revokedAt_expiresAt_idx" ON "AccountingOwnerSession"("revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "AccountingOwnerSession_lastUsedAt_idx" ON "AccountingOwnerSession"("lastUsedAt");

-- CreateIndex
CREATE INDEX "AccountingOwnerSession_createdAt_idx" ON "AccountingOwnerSession"("createdAt");
