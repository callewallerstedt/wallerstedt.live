import "dotenv/config";

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url:
      process.env.SUPA_POSTGRES_URL_NON_POOLING?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      env("DATABASE_URL"),
  },
});
