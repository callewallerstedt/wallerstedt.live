-- CreateTable
CREATE TABLE "AccountingGmailAccount" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastError" TEXT NOT NULL DEFAULT '',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingGmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingGmailAccount_email_key" ON "AccountingGmailAccount"("email");

-- CreateIndex
CREATE INDEX "AccountingGmailAccount_status_updatedAt_idx" ON "AccountingGmailAccount"("status", "updatedAt");
