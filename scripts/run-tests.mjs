import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const root = process.argv[2];
if (!root) throw new Error("test root is required");
const allowEmpty = process.argv.includes("--allow-empty");
if (!existsSync(root)) {
  if (!allowEmpty) throw new Error(`test root does not exist: ${root}`);
  console.log(`scaffold tests=0 root=${root}`);
  process.exit(0);
}

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    return /\.test\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

const files = (await collect(root)).sort();
if (files.length === 0) {
  if (!allowEmpty) throw new Error(`no test files under ${root}`);
  console.log(`scaffold tests=0 root=${root}`);
  process.exit(0);
}
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
