import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const root = fileURLToPath(new URL('../', import.meta.url));
if (!relative(resolve(root, 'apps'), cwd).match(/^[^./\\][^/\\]*$/)) throw new Error('build must run inside apps/<module>');
const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
const require = createRequire(join(cwd, 'package.json'));
const isBroker = manifest.name === 'issus';
const isCli = manifest.name === '@issus/cli';
if (isBroker && !process.argv.includes('--server-only')) {
  const vite = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  const result = spawnSync(process.execPath, [vite, 'build'], { stdio: 'inherit', cwd });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const entry = isCli ? 'src/entry/index.ts' : isBroker ? 'src/server/entry/broker/index.ts' : 'src/server/entry/index.ts';
const output = isCli ? 'dist/index.js' : entry.replace(/^src\//, 'dist/').replace(/\.ts$/, '.js');
const esbuild = join(dirname(require.resolve('esbuild/package.json')), 'bin/esbuild');
const result = spawnSync(process.execPath, [esbuild, entry, `--outfile=${output}`, '--bundle', '--platform=node', '--format=esm', '--target=node24',
  "--banner:js=import { createRequire as __issusCreateRequire } from 'node:module'; const require = __issusCreateRequire(import.meta.url);",
  '--sourcemap', '--log-level=info'], { stdio: 'inherit', cwd });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (isBroker) {
  mkdirSync(join(cwd, 'dist/migrations'), { recursive: true });
  copyFileSync(join(root, 'packages/issus_domain/dist/server/backend/schema/0001-domain-baseline.sql'), join(cwd, 'dist/migrations/0001-domain-baseline.sql'));
  // 0002+ 순번 migration은 dist/migrations/extra에 바이트 그대로 복사한다. broker가 runMigrations({directory})로 적용한다(core/s5 0004 등).
  const schemaDir = join(root, 'packages/issus_domain/dist/server/backend/schema');
  mkdirSync(join(cwd, 'dist/migrations/extra'), { recursive: true });
  for (const file of readdirSync(schemaDir).filter((f) => /^\d{4}-.+\.sql$/.test(f) && !f.startsWith('0001-')).sort()) copyFileSync(join(schemaDir, file), join(cwd, 'dist/migrations/extra', file));
}
const files = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name !== 'manifest.json') files.push({ path: relative(join(cwd, 'dist'), path).replaceAll('\\', '/'), sha256: createHash('sha256').update(readFileSync(path)).digest('hex') });
  }
}
mkdirSync('dist', { recursive: true });
collect(join(cwd, 'dist'));
writeFileSync('dist/manifest.json', JSON.stringify({ name: manifest.name, runtime: 'node24', entry: output.slice(5), files: files.sort((a, b) => a.path.localeCompare(b.path)) }, null, 2) + '\n', 'utf8');
