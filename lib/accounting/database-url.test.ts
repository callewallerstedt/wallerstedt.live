import assert from "node:assert/strict";
import test from "node:test";

import { getDirectDatabaseUrl } from "../database-url";

test("prefers the pooled direct database URL", () => {
  const environment = {
    DATABASE_URL: "postgresql://user:secret@pooler.neon.tech/app",
    DATABASE_URL_UNPOOLED: "postgresql://user:secret@neon.tech/app",
  } as NodeJS.ProcessEnv;

  assert.equal(getDirectDatabaseUrl(environment), environment.DATABASE_URL);
});

test("prefers the replacement Supabase database over the exhausted legacy database", () => {
  const environment = {
    SUPA_POSTGRES_URL: "postgresql://user:secret@pooler.supabase.com/app",
    DATABASE_URL: "postgresql://user:secret@pooler.neon.tech/app",
  } as NodeJS.ProcessEnv;

  assert.equal(
    getDirectDatabaseUrl(environment),
    "postgresql://user:secret@pooler.supabase.com/app",
  );
});

test("keeps Supabase require-mode encrypted with libpq-compatible verification semantics", () => {
  const result = getDirectDatabaseUrl({
    SUPA_POSTGRES_URL:
      "postgres://user:secret@aws-0-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x",
  } as NodeJS.ProcessEnv);
  const url = new URL(result!);

  assert.equal(url.searchParams.get("sslmode"), "require");
  assert.equal(url.searchParams.get("uselibpqcompat"), "true");
});

test("ignores Prisma Accelerate and falls back to direct Neon Postgres", () => {
  const environment = {
    DATABASE_URL: "prisma://accelerate.prisma-data.net/?api_key=secret",
    POSTGRES_URL: "postgresql://user:secret@pooler.neon.tech/app",
  } as NodeJS.ProcessEnv;

  assert.equal(getDirectDatabaseUrl(environment), environment.POSTGRES_URL);
});

test("does not return a metered Prisma proxy URL", () => {
  const environment = {
    DATABASE_URL: "prisma+postgres://accelerate.prisma-data.net/?api_key=secret",
  } as NodeJS.ProcessEnv;

  assert.equal(getDirectDatabaseUrl(environment), undefined);
});
