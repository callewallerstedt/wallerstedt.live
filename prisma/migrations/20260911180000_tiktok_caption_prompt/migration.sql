-- Shared caption-writing tips for TikTok video ideas (one row).
-- Safe to apply on production if CompanyTask already exists.
--
--   npm run prisma:deploy

CREATE TABLE "CompanyTikTokCaptionPrompt" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyTikTokCaptionPrompt_pkey" PRIMARY KEY ("id")
);
