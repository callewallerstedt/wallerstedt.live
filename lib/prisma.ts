import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";

import { getDirectDatabaseUrl } from "./database-url";

declare global {
  var __wallerstedtPrisma: ReturnType<typeof createPrismaClient> | undefined;
}

const databaseUrl = getDirectDatabaseUrl();

function getPrismaLogLevels(): Prisma.LogLevel[] {
  return process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];
}

function createPrismaClient(connectionString: string) {
  const adapter = new PrismaPg({
    connectionString,
  });

  return new PrismaClient({
    adapter,
    log: getPrismaLogLevels(),
  });
}

export const prisma =
  databaseUrl
    ? global.__wallerstedtPrisma ??
      createPrismaClient(databaseUrl)
    : null;

if (prisma && process.env.NODE_ENV !== "production") {
  global.__wallerstedtPrisma = prisma;
}

export function hasPrismaDatabase() {
  return Boolean(databaseUrl);
}
