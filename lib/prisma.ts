import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

declare global {
  var __wallerstedtPrisma: ReturnType<typeof createPrismaClient> | undefined;
}

const databaseUrl = process.env.DATABASE_URL?.trim();

function isAccelerateUrl(value: string) {
  return value.startsWith("prisma://") || value.startsWith("prisma+postgres://");
}

function getPrismaLogLevels(): Prisma.LogLevel[] {
  return process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];
}

function createPrismaClient(connectionString: string) {
  if (isAccelerateUrl(connectionString)) {
    return new PrismaClient({
      accelerateUrl: connectionString,
      log: getPrismaLogLevels(),
    }).$extends(withAccelerate());
  }

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
