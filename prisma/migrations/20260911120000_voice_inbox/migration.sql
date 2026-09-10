CREATE TABLE "CompanyVoiceReply" (
    "id" UUID NOT NULL,
    "ownerHash" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "images" TEXT[] NOT NULL,
    "agent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyVoiceReply_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompanyVoiceReply_ownerHash_createdAt_idx" ON "CompanyVoiceReply"("ownerHash", "createdAt");
CREATE INDEX "CompanyVoiceReply_createdAt_idx" ON "CompanyVoiceReply"("createdAt");
