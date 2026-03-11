import { PrismaClient } from "@prisma/client";

declare global {
  var __wallerstedtPrisma: PrismaClient | undefined;
}

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

export const prisma =
  hasDatabaseUrl
    ? global.__wallerstedtPrisma ??
      new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      })
    : null;

if (prisma && process.env.NODE_ENV !== "production") {
  global.__wallerstedtPrisma = prisma;
}

export function hasPrismaDatabase() {
  return Boolean(prisma);
}
