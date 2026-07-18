import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import { getDirectDatabaseUrl } from "../database-url";
import { AccountingError } from "./errors";

function createAccountingPrisma(connectionString: string): PrismaClient {
  const log: Prisma.LogLevel[] =
    process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log,
  });
}

type AccountingPrisma = PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __accountingPrisma: AccountingPrisma | undefined;
}

let productionClient: AccountingPrisma | undefined;

/** Build-safe lazy database initialization. Never call this at module evaluation time. */
export function getAccountingDb(): AccountingPrisma {
  const connectionString = getDirectDatabaseUrl();
  if (!connectionString) {
    throw new AccountingError(
      "A direct Postgres database is not configured.",
      503,
      "database_unavailable",
    );
  }

  if (process.env.NODE_ENV === "production") {
    productionClient ??= createAccountingPrisma(connectionString);
    return productionClient;
  }

  global.__accountingPrisma ??= createAccountingPrisma(connectionString);
  return global.__accountingPrisma;
}
