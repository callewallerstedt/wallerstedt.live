CREATE TABLE "AccountingBankAuthState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "bank" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "AccountingBankConnection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "bank" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "accounts" JSONB NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
