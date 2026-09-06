-- Daily 20:00 Berlin "go record" Web Push lock (one row).
CREATE TABLE "CompanyRecordNudge" (
    "id" TEXT NOT NULL,
    "lastSentYmd" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyRecordNudge_pkey" PRIMARY KEY ("id")
);
