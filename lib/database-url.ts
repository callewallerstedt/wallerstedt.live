const directDatabaseVariableNames = [
  "SUPA_POSTGRES_URL",
  "SUPA_POSTGRES_PRISMA_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "SUPA_POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
] as const;

function isDirectPostgresUrl(value: string) {
  return value.startsWith("postgres://") || value.startsWith("postgresql://");
}

function normalizeProviderUrl(value: string) {
  const url = new URL(value);
  if (
    url.hostname.endsWith(".supabase.com") &&
    url.searchParams.get("sslmode") === "require" &&
    !url.searchParams.has("uselibpqcompat")
  ) {
    // Supabase's documented `require` mode encrypts without CA verification.
    // pg 8 currently aliases it to verify-full unless libpq compatibility is
    // explicit, which rejects the shared pooler's certificate chain.
    url.searchParams.set("uselibpqcompat", "true");
  }
  return url.toString();
}

/**
 * Resolve a direct Postgres connection and deliberately ignore Prisma
 * Accelerate/Data Proxy URLs. Vercel database integrations supply the pooled
 * Postgres variables used here, so runtime traffic goes straight to the
 * database provider and cannot consume Prisma's metered transfer allowance.
 */
export function getDirectDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
) {
  for (const variableName of directDatabaseVariableNames) {
    const value = environment[variableName]?.trim();
    if (value && isDirectPostgresUrl(value)) {
      return normalizeProviderUrl(value);
    }
  }

  return undefined;
}
