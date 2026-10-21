import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`evidence command failed: ${cmd} ${args[0]}`);
  return result.stdout.trim();
};
const hash = value => createHash('sha256').update(value).digest('hex');
const services = process.argv.slice(2);
const compose = JSON.parse(run('docker', ['compose', 'config', '--format', 'json']));
const evidence = {
  stage: 'scaffold', timestamp: new Date().toISOString(), head: run('git', ['rev-parse', 'HEAD']),
  dirtyDiffSha256: hash(run('git', ['diff', '--binary', 'HEAD'])),
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
