CREATE TABLE "CompanyVoiceTranscript" (
    "id" UUID NOT NULL,
    "ownerHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "images" TEXT[] NOT NULL,
    "agent" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyVoiceTranscript_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CompanyVoiceTranscript_ownerHash_clientId_key" ON "CompanyVoiceTranscript"("ownerHash", "clientId");
CREATE INDEX "CompanyVoiceTranscript_ownerHash_occurredAt_idx" ON "CompanyVoiceTranscript"("ownerHash", "occurredAt");
CREATE INDEX "CompanyVoiceTranscript_createdAt_idx" ON "CompanyVoiceTranscript"("createdAt");
