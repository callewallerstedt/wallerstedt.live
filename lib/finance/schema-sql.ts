/**
 * Personal finance tables. Idempotent on purpose: the same statements are the
 * Prisma migration and the runtime bootstrap, so the Privat tab works on the
 * first deploy even before `prisma migrate deploy` has been run.
 */
export const FINANCE_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS "FinanceBankSession" (
    "id" TEXT NOT NULL,
    "aspspName" TEXT NOT NULL,
    "aspspCountry" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "validUntil" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceBankSession_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "FinanceAuthState" (
    "id" TEXT NOT NULL,
    "aspspName" TEXT NOT NULL,
    "aspspCountry" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceAuthState_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "FinanceAccount" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL DEFAULT '',
    "aspspName" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "displayName" TEXT NOT NULL DEFAULT '',
    "product" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "balanceCents" BIGINT,
    "balanceType" TEXT NOT NULL DEFAULT '',
    "balanceAt" TIMESTAMP(3),
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "FinanceTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "bookingDate" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "status" TEXT NOT NULL DEFAULT 'BOOK',
    "counterparty" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "merchant" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'other',
    "categorySource" TEXT NOT NULL DEFAULT 'auto',
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceTransaction_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "FinanceTransaction_bookingDate_idx" ON "FinanceTransaction"("bookingDate")`,
  `CREATE INDEX IF NOT EXISTS "FinanceTransaction_accountId_bookingDate_idx" ON "FinanceTransaction"("accountId", "bookingDate")`,
  `CREATE INDEX IF NOT EXISTS "FinanceTransaction_category_bookingDate_idx" ON "FinanceTransaction"("category", "bookingDate")`,
  `CREATE INDEX IF NOT EXISTS "FinanceTransaction_merchant_idx" ON "FinanceTransaction"("merchant")`,
  `CREATE TABLE IF NOT EXISTS "FinanceBudget" (
    "category" TEXT NOT NULL,
    "monthlyCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceBudget_pkey" PRIMARY KEY ("category")
  )`,
  `CREATE TABLE IF NOT EXISTS "FinanceCategoryRule" (
    "merchant" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceCategoryRule_pkey" PRIMARY KEY ("merchant")
  )`,
  `CREATE TABLE IF NOT EXISTS "FinanceAsset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'investment',
    "valueCents" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceAsset_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "FinanceSnapshot" (
    "day" DATE NOT NULL,
    "bankCents" BIGINT NOT NULL,
    "assetsCents" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceSnapshot_pkey" PRIMARY KEY ("day")
  )`,
  `CREATE TABLE IF NOT EXISTS "FinanceMeta" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceMeta_pkey" PRIMARY KEY ("key")
  )`,
];
