-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "href" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeslaLiveState" (
    "vin" TEXT NOT NULL,
    "speedKmh" INTEGER NOT NULL DEFAULT 0,
    "gear" TEXT NOT NULL DEFAULT 'P',
    "batteryPercent" INTEGER NOT NULL DEFAULT -1,
    "rangeKm" INTEGER NOT NULL DEFAULT -1,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeslaLiveState_pkey" PRIMARY KEY ("vin")
);

-- CreateTable
CREATE TABLE "TeslaTrip" (
    "id" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "driveSeconds" INTEGER NOT NULL DEFAULT 0,
    "maxSpeedKmh" INTEGER NOT NULL DEFAULT 0,
    "avgSpeedKmh" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startBattery" INTEGER NOT NULL DEFAULT -1,
    "endBattery" INTEGER NOT NULL DEFAULT -1,
    "startRangeKm" INTEGER NOT NULL DEFAULT -1,
    "endRangeKm" INTEGER NOT NULL DEFAULT -1,
    "startLat" DOUBLE PRECISION,
    "startLon" DOUBLE PRECISION,
    "endLat" DOUBLE PRECISION,
    "endLon" DOUBLE PRECISION,
    "destination" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeslaTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeslaTripSample" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "speedKmh" INTEGER NOT NULL DEFAULT 0,
    "gear" TEXT NOT NULL DEFAULT 'P',
    "batteryPercent" INTEGER NOT NULL DEFAULT -1,
    "rangeKm" INTEGER NOT NULL DEFAULT -1,
    "odometerKm" DOUBLE PRECISION,
    "outsideTempC" DOUBLE PRECISION,
    "destinationName" TEXT NOT NULL DEFAULT '',
    "routeLine" TEXT NOT NULL DEFAULT '',
    "routeTrafficDelayMin" DOUBLE PRECISION,
    "chargeState" TEXT NOT NULL DEFAULT '',
    "chargePowerKw" DOUBLE PRECISION,
    "chargeRateKmh" DOUBLE PRECISION,
    "chargerVoltage" DOUBLE PRECISION,
    "chargerAmps" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeslaTripSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeslaChargeEvent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT,
    "vin" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "startBattery" INTEGER NOT NULL DEFAULT -1,
    "endBattery" INTEGER NOT NULL DEFAULT -1,
    "startRangeKm" INTEGER NOT NULL DEFAULT -1,
    "endRangeKm" INTEGER NOT NULL DEFAULT -1,
    "maxPowerKw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "energyAddedPct" INTEGER NOT NULL DEFAULT 0,
    "locationLat" DOUBLE PRECISION,
    "locationLon" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeslaChargeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingAccount" (
    "id" UUID NOT NULL,
    "legacyId" INTEGER,
    "account" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingEntry" (
    "id" UUID NOT NULL,
    "legacyId" INTEGER,
    "date" DATE,
    "description" TEXT NOT NULL DEFAULT '',
    "debitName" TEXT,
    "debitAccount" INTEGER,
    "creditName" TEXT,
    "creditAccount" INTEGER,
    "amountExVat" DECIMAL(18,2),
    "vatAmount" DECIMAL(18,2),
    "vatAccount" INTEGER,
    "amount" DECIMAL(18,2) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Utbetalning',
    "source" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'Bokförd',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingDocument" (
    "id" UUID NOT NULL,
    "legacyId" INTEGER,
    "legacyTransactionId" INTEGER,
    "entryId" UUID,
    "originalName" TEXT NOT NULL,
    "blobPathname" TEXT,
    "blobUrl" TEXT,
    "sha256" TEXT,
    "byteSize" INTEGER,
    "mimeType" TEXT,
    "storageStatus" TEXT NOT NULL DEFAULT 'metadata_only',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingEntryRevision" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingEntryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingAuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingAiDraft" (
    "id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "model" TEXT NOT NULL,
    "inputText" TEXT NOT NULL DEFAULT '',
    "documentIds" JSONB NOT NULL,
    "extracted" JSONB NOT NULL,
    "entryId" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingAiDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingLoginThrottle" (
    "id" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingLoginThrottle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingSyncDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCursor" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingSyncDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingSyncOperation" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "operation" TEXT NOT NULL,
    "baseVersion" INTEGER,
    "appliedVersion" INTEGER,
    "status" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingSyncOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingBackup" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "blobPathname" TEXT,
    "blobUrl" TEXT,
    "sha256" TEXT,
    "byteSize" INTEGER,
    "entryCount" INTEGER,
    "documentCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'created',
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_type_createdAt_idx" ON "AnalyticsEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_path_createdAt_idx" ON "AnalyticsEvent"("path", "createdAt");

-- CreateIndex
CREATE INDEX "TeslaTrip_vin_startedAt_idx" ON "TeslaTrip"("vin", "startedAt");

-- CreateIndex
CREATE INDEX "TeslaTrip_endedAt_updatedAt_idx" ON "TeslaTrip"("endedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "TeslaTripSample_vin_sampledAt_idx" ON "TeslaTripSample"("vin", "sampledAt");

-- CreateIndex
CREATE INDEX "TeslaTripSample_tripId_sampledAt_idx" ON "TeslaTripSample"("tripId", "sampledAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeslaTripSample_tripId_sampledAt_key" ON "TeslaTripSample"("tripId", "sampledAt");

-- CreateIndex
CREATE INDEX "TeslaChargeEvent_vin_startedAt_idx" ON "TeslaChargeEvent"("vin", "startedAt");

-- CreateIndex
CREATE INDEX "TeslaChargeEvent_endedAt_updatedAt_idx" ON "TeslaChargeEvent"("endedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAccount_legacyId_key" ON "AccountingAccount"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAccount_account_key" ON "AccountingAccount"("account");

-- CreateIndex
CREATE INDEX "AccountingAccount_deletedAt_account_idx" ON "AccountingAccount"("deletedAt", "account");

-- CreateIndex
CREATE INDEX "AccountingAccount_updatedAt_idx" ON "AccountingAccount"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEntry_legacyId_key" ON "AccountingEntry"("legacyId");

-- CreateIndex
CREATE INDEX "AccountingEntry_deletedAt_date_idx" ON "AccountingEntry"("deletedAt", "date");

-- CreateIndex
CREATE INDEX "AccountingEntry_type_date_idx" ON "AccountingEntry"("type", "date");

-- CreateIndex
CREATE INDEX "AccountingEntry_status_date_idx" ON "AccountingEntry"("status", "date");

-- CreateIndex
CREATE INDEX "AccountingEntry_updatedAt_idx" ON "AccountingEntry"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingDocument_legacyId_key" ON "AccountingDocument"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingDocument_blobPathname_key" ON "AccountingDocument"("blobPathname");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingDocument_blobUrl_key" ON "AccountingDocument"("blobUrl");

-- CreateIndex
CREATE INDEX "AccountingDocument_entryId_deletedAt_idx" ON "AccountingDocument"("entryId", "deletedAt");

-- CreateIndex
CREATE INDEX "AccountingDocument_sha256_idx" ON "AccountingDocument"("sha256");

-- CreateIndex
CREATE INDEX "AccountingDocument_updatedAt_idx" ON "AccountingDocument"("updatedAt");

-- CreateIndex
CREATE INDEX "AccountingEntryRevision_createdAt_idx" ON "AccountingEntryRevision"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEntryRevision_entryId_version_key" ON "AccountingEntryRevision"("entryId", "version");

-- CreateIndex
CREATE INDEX "AccountingAuditEvent_entityType_entityId_id_idx" ON "AccountingAuditEvent"("entityType", "entityId", "id");

-- CreateIndex
CREATE INDEX "AccountingAuditEvent_createdAt_idx" ON "AccountingAuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AccountingAiDraft_status_createdAt_idx" ON "AccountingAiDraft"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AccountingLoginThrottle_lockedUntil_idx" ON "AccountingLoginThrottle"("lockedUntil");

-- CreateIndex
CREATE INDEX "AccountingLoginThrottle_updatedAt_idx" ON "AccountingLoginThrottle"("updatedAt");

-- CreateIndex
CREATE INDEX "AccountingSyncDevice_lastSeenAt_idx" ON "AccountingSyncDevice"("lastSeenAt");

-- CreateIndex
CREATE INDEX "AccountingSyncOperation_deviceId_createdAt_idx" ON "AccountingSyncOperation"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountingSyncOperation_entityType_entityId_idx" ON "AccountingSyncOperation"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AccountingSyncOperation_status_createdAt_idx" ON "AccountingSyncOperation"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingBackup_blobPathname_key" ON "AccountingBackup"("blobPathname");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingBackup_blobUrl_key" ON "AccountingBackup"("blobUrl");

-- CreateIndex
CREATE INDEX "AccountingBackup_createdAt_idx" ON "AccountingBackup"("createdAt");

-- AddForeignKey
ALTER TABLE "TeslaTripSample" ADD CONSTRAINT "TeslaTripSample_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TeslaTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeslaChargeEvent" ADD CONSTRAINT "TeslaChargeEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TeslaTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingDocument" ADD CONSTRAINT "AccountingDocument_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntryRevision" ADD CONSTRAINT "AccountingEntryRevision_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingAiDraft" ADD CONSTRAINT "AccountingAiDraft_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
