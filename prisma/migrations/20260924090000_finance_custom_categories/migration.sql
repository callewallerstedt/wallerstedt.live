-- Owner-made finance categories. Idempotent; mirrors lib/finance/schema-sql.ts.
CREATE TABLE IF NOT EXISTS "FinanceCustomCategory" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "emoji" TEXT NOT NULL DEFAULT '',
  "kind" TEXT NOT NULL DEFAULT 'spending',
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCustomCategory_pkey" PRIMARY KEY ("id")
);
