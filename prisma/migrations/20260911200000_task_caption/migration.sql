-- Persist the TikTok caption generated when a video idea enters practicing.
-- Safe to apply on production if CompanyTask already exists.
--
--   npm run prisma:deploy

ALTER TABLE "CompanyTask" ADD COLUMN "caption" TEXT NOT NULL DEFAULT '';
