import { spawnSync } from "node:child_process";
import path from "node:path";

const env = { ...process.env };

if (!env.DATABASE_URL) {
  env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/wallerstedt";
}

const prismaCliPath = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
const result = spawnSync(process.execPath, [prismaCliPath, "generate"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.error) {
  console.error(result.error);
}

process.exit(1);
