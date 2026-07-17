import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(resolve(root, ".env.local"));
} catch {
  // Explicit process environment remains supported in CI/recovery shells.
}

const prismaCli = resolve(root, "node_modules", "prisma", "build", "index.js");
const result = spawnSync(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
