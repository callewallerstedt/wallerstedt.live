-- Watched TikTok piano-cover accounts and persisted scan results
-- for the Företags-OS TikTok tab (weekly-piano-tiktok-watch).

CREATE TABLE "CompanyTikTokAccount" (
    "id" UUID NOT NULL,
    "handle" TEXT NOT NULL,
    "uniqueId" TEXT NOT NULL DEFAULT '',
    "nickname" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyTikTokAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyTikTokAccount_handle_key" ON "CompanyTikTokAccount"("handle");
CREATE INDEX "CompanyTikTokAccount_sortOrder_createdAt_idx" ON "CompanyTikTokAccount"("sortOrder", "createdAt");

CREATE TABLE "CompanyTikTokScan" (
    "id" UUID NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weekKey" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,

    CONSTRAINT "CompanyTikTokScan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyTikTokScan_scannedAt_idx" ON "CompanyTikTokScan"("scannedAt");
CREATE INDEX "CompanyTikTokScan_weekKey_idx" ON "CompanyTikTokScan"("weekKey");
