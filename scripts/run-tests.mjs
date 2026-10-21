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
// 브라우저 시험은 공유 Clock·세션을 바꾸므로 파일 병렬 실행 금지(P9 VERIFY P1-4): tests/browser 아래는 직렬.
const serial = /(^|[\/])tests[\/]browser$/.test(root.replace(/[\/]+$/, ""));
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...(serial ? ["--test-concurrency=1"] : []), ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
