import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Resolve depends_on and shared-image siblings to a fixed point before building. */
export function resolveDeploymentPlan(config, requested, root = process.cwd()) {
  const definitions = config.services ?? {};
  const selected = new Set(requested);
  if (selected.size === 0) throw new Error('no deployment services requested');
  for (const name of selected) {
    const service = definitions[name];
    if (!service) throw new Error(`docker-compose.yml has no service named: ${name}`);
    const dependencies = Array.isArray(service.depends_on) ? service.depends_on : Object.keys(service.depends_on ?? {});
    for (const dependency of dependencies) selected.add(dependency);
    if (service.image) {
      for (const [sibling, definition] of Object.entries(definitions)) {
        if (definition.image === service.image) selected.add(sibling);
      }
    }
  }
  const services = [...selected].sort();
  const filters = new Set();
  for (const name of services) {
    const build = definitions[name].build;
    if (!build) continue;
    const context = typeof build === 'string' ? build : build.context ?? '.';
    const dockerfile = typeof build === 'string' ? 'Dockerfile' : build.dockerfile ?? 'Dockerfile';
    const path = relative(root, resolve(root, context, dockerfile)).replaceAll('\\', '/');
    const owner = path.match(/^(apps\/[^/]+)\//)?.[1];
    if (!owner) throw new Error(`cannot resolve local build owner: ${name}`);
    filters.add(`./${owner}`);
  }
  return { services, buildFilters: [...filters].sort() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = JSON.parse(readFileSync(0, 'utf8'));
  console.log(JSON.stringify(resolveDeploymentPlan(config, process.argv.slice(2))));
}
