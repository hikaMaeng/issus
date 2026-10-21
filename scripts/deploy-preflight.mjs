import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

const run = (...args) => spawnSync('docker', args, { encoding: 'utf8', windowsHide: true });
const configResult = run('compose', 'config', '--format', 'json');
if (configResult.status !== 0) throw new Error('compose config failed');
const config = JSON.parse(configResult.stdout);
if (config.name !== 'issus') throw new Error('compose project must be issus');
const targets = new Set();
function visit(name) {
  if (targets.has(name)) return;
  if (!config.services[name]) throw new Error(`unknown service ${name}`);
  targets.add(name);
  for (const dependency of Object.keys(config.services[name].depends_on ?? {})) visit(dependency);
}
for (const name of process.argv.slice(2)) visit(name);
for (const name of targets) {
  const service = config.services[name];
  const result = run('inspect', service.container_name);
  const existing = result.status === 0 ? JSON.parse(result.stdout)[0] : undefined;
  const owner = existing?.Config?.Labels?.['com.docker.compose.project'];
  const ownerService = existing?.Config?.Labels?.['com.docker.compose.service'];
  if (existing && (owner !== 'issus' || ownerService !== name)) {
    throw new Error(`container-name-conflict name=${service.container_name} owner=${owner ?? 'unlabelled'} service=${ownerService ?? 'unlabelled'}`);
  }
  for (const port of service.ports ?? []) {
    const number = Number(port.published);
    if (!Number.isInteger(number) || number < 10000 || number > 59999) throw new Error(`port-range service=${name}`);
    const assigned = Object.values(existing?.NetworkSettings?.Ports ?? {}).flat().filter(Boolean);
    if (existing?.State?.Running && assigned.some(p => Number(p.HostPort) === number && p.HostIp === port.host_ip)) continue;
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', error => reject(new Error(`port-conflict service=${name} host=${port.host_ip}:${number} reason=${error.code}`)));
      server.listen({ port: number, host: port.host_ip, exclusive: true }, () => server.close(resolve));
    });
  }
}
console.log(`deploy-preflight status=ok project=issus services=${[...targets].join(',')}`);
