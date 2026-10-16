-- Server-side Tesla Fleet API login for agents. Idempotent; mirrors TESLA_SCHEMA_SQL in lib/tesla-agent.ts.
CREATE TABLE IF NOT EXISTS "TeslaFleetToken" (
  "id" TEXT NOT NULL,
  "refreshCipher" TEXT NOT NULL,
  "accessCipher" TEXT NOT NULL DEFAULT '',
  "accessExpiresAt" TIMESTAMP(3),
  "lastError" TEXT NOT NULL DEFAULT '',
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeslaFleetToken_pkey" PRIMARY KEY ("id")
);
