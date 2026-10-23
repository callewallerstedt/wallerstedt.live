ALTER TABLE "AccountingBankAuthState"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "errorStage" TEXT,
  ADD COLUMN "session" JSONB,
  ADD COLUMN "connectionId" TEXT;
