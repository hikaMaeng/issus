import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveDeploymentPlan } from './deploy-targets.mjs';

const build = app => ({ context: '.', dockerfile: `apps/${app}/docker/Dockerfile` });
const service = (name, depends_on = {}) => ({ image: `${name}:local`, build: build(name), depends_on });
const config = { services: {
  worker: service('worker', { broker: {} }), broker: service('broker', { db: {} }),
  db: service('db'), unrelated: service('unrelated')
} };

test('partial deployment builds the transitive dependency closure, excluding unrelated apps', () => {
  assert.deepEqual(resolveDeploymentPlan(config, ['worker']), {
    services: ['broker', 'db', 'worker'], buildFilters: ['./apps/broker', './apps/db', './apps/worker']
  });
});

test('shared-image siblings and dependencies of those siblings reach a fixed point', () => {
  const services = { ...config.services,
    role: { image: 'broker:local', depends_on: ['extra'] },
    extra: service('extra', { tail: {} }), tail: { image: 'tail:local', depends_on: { worker: {} } },
    sibling: { image: 'tail:local', build: build('tail') }
  };
  const plan = resolveDeploymentPlan({ services }, ['worker']);
  assert.deepEqual(plan.services, ['broker', 'db', 'extra', 'role', 'sibling', 'tail', 'worker']);
  assert.deepEqual(plan.buildFilters, ['./apps/broker', './apps/db', './apps/extra', './apps/tail', './apps/worker']);
});

test('cycles and duplicate requests terminate with a stable order', () => {
  const cyclic = { services: { a: service('a', ['b']), b: service('b', ['a']) } };
  assert.deepEqual(resolveDeploymentPlan(cyclic, ['b', 'a', 'b']), resolveDeploymentPlan(cyclic, ['a']));
});

test('unknown requests, missing dependencies and unknown build owners fail before building', () => {
  assert.throws(() => resolveDeploymentPlan(config, []), /no deployment services/);
  assert.throws(() => resolveDeploymentPlan(config, ['missing']), /no service named: missing/);
  assert.throws(() => resolveDeploymentPlan({ services: { a: service('a', ['missing']) } }, ['a']), /no service named: missing/);
  assert.throws(() => resolveDeploymentPlan({ services: { a: { build: '.' } } }, ['a']), /cannot resolve local build owner/);
});

test('resolved Compose JSON for this checkout includes broker and DB in a worker deployment', { skip: !process.env.ISSUS_COMPOSE_CONFIG }, () => {
  const actual = JSON.parse(readFileSync(process.env.ISSUS_COMPOSE_CONFIG, 'utf8'));
  assert.deepEqual(resolveDeploymentPlan(actual, ['issus-worker']), {
    services: ['issus', 'issus-db', 'issus-worker'],
    buildFilters: ['./apps/issus', './apps/issus-db', './apps/issus-worker']
  });
});
