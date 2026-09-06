-- Persisted Treg piano-cover search per video idea (CompanyTask).
-- One row per task; Refresh overwrites query + payload and bumps updatedAt.
-- Safe to apply on production if CompanyTask already exists.
--
--   npm run prisma:deploy
--
-- Manual apply (psql / Neon SQL editor):
--
--   CREATE TABLE "CompanyTikTokSearch" (
--     "id" UUID NOT NULL,
--     "taskId" UUID NOT NULL,
--     "query" TEXT NOT NULL,
--     "payload" JSONB NOT NULL,
--     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     "updatedAt" TIMESTAMP(3) NOT NULL,
--     CONSTRAINT "CompanyTikTokSearch_pkey" PRIMARY KEY ("id")
--   );
--   CREATE UNIQUE INDEX "CompanyTikTokSearch_taskId_key" ON "CompanyTikTokSearch"("taskId");
--   CREATE INDEX "CompanyTikTokSearch_updatedAt_idx" ON "CompanyTikTokSearch"("updatedAt");
--   ALTER TABLE "CompanyTikTokSearch"
--     ADD CONSTRAINT "CompanyTikTokSearch_taskId_fkey"
--     FOREIGN KEY ("taskId") REFERENCES "CompanyTask"("id")
--     ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CompanyTikTokSearch" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "query" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyTikTokSearch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyTikTokSearch_taskId_key" ON "CompanyTikTokSearch"("taskId");
CREATE INDEX "CompanyTikTokSearch_updatedAt_idx" ON "CompanyTikTokSearch"("updatedAt");

ALTER TABLE "CompanyTikTokSearch" ADD CONSTRAINT "CompanyTikTokSearch_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CompanyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
