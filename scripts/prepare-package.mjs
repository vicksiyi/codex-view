import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const nextRoot = path.join(root, ".next");
const cleanupTargets = [
  path.join(nextRoot, "build"),
  path.join(nextRoot, "cache"),
  path.join(nextRoot, "dev"),
  path.join(nextRoot, "diagnostics"),
  path.join(nextRoot, "standalone"),
  path.join(nextRoot, "trace-build"),
  path.join(nextRoot, "trace"),
  path.join(nextRoot, "turbopack"),
  path.join(nextRoot, "types")
];

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(nextRoot))) {
  throw new Error("Missing .next. Run `next build` before packaging.");
}

for (const target of cleanupTargets) {
  await fs.rm(target, { recursive: true, force: true });
}
