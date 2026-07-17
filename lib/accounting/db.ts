import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { AccountingError } from "./errors";

function isAccelerateUrl(value: string) {
  return value.startsWith("prisma://") || value.startsWith("prisma+postgres://");
}

function createAccountingPrisma(connectionString: string): PrismaClient {
  const log: Prisma.LogLevel[] =
    process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

  if (isAccelerateUrl(connectionString)) {
    return new PrismaClient({
      accelerateUrl: connectionString,
      log,
    }).$extends(withAccelerate()) as unknown as PrismaClient;
  }

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
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new AccountingError(
      "Accounting database is not configured.",
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
