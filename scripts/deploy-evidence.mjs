import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`evidence command failed: ${cmd} ${args[0]}`);
  return result.stdout.trim();
};
const hash = value => createHash('sha256').update(value).digest('hex');

/** Hash tracked changes and sorted untracked path/byte hashes without exposing contents. */
export function dirtyDiffSha256(diff, paths, readBytes = readFileSync) {
  const untracked = [...new Set(paths)].sort().map(path => ({ path, sha256: hash(readBytes(path)) }));
  return hash(JSON.stringify({ trackedDiffSha256: hash(diff), untracked }));
}

/** Read exact git bytes, including staged/unstaged diffs and NUL-delimited filenames. */
export function repositoryDirtyHash(git = args => {
  const result = spawnSync('git', args, { windowsHide: true });
  if (result.status !== 0) throw new Error(`evidence command failed: git ${args[0]}`);
  return result.stdout;
}, readBytes = readFileSync) {
  const diff = git(['diff', '--binary', 'HEAD']);
  const paths = git(['ls-files', '--others', '--exclude-standard', '-z']).toString('utf8').split('\0').filter(Boolean);
  return dirtyDiffSha256(diff, paths, readBytes);
}

function main() {
  const services = process.argv.slice(2);
  const compose = JSON.parse(run('docker', ['compose', 'config', '--format', 'json']));
  const evidence = {
    stage: 'scaffold', timestamp: new Date().toISOString(), head: run('git', ['rev-parse', 'HEAD']),
    dirtyDiffSha256: repositoryDirtyHash(),
    // Only hashes leave the process; resolved environment may contain secrets.
    configSha256: hash(JSON.stringify(compose)),
    services: services.map(name => {
      const image = JSON.parse(run('docker', ['image', 'inspect', compose.services[name].image]))[0];
      const manifestPath = `apps/${name}/dist/manifest.json`;
      return { name, imageId: image.Id, repoDigests: image.RepoDigests ?? [], bundleManifestSha256: existsSync(manifestPath) ? hash(readFileSync(manifestPath)) : null };
    }),
    unverified: ['functional migrations', 'queue readiness', 'authenticated WebSocket subscription']
  };
  mkdirSync('.docker', { recursive: true });
  writeFileSync('.docker/deploy-report.json', JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('deploy-evidence path=.docker/deploy-report.json stage=scaffold');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
