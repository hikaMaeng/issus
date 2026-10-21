import { readFile } from 'node:fs/promises';
import { Router } from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatabasePool, createEventBroker, EventStore, PgmqClient, readEnv, type AgentEnv, type EventBrokerOptions, type Service } from 'agent/broker';
import { QUEUES } from 'issus_domain/common';
import { compactPublication, readCompactHistory, EventUnitOfWork, IntakeService, sha256 } from 'issus_domain/server';
import { createHealth, parseRuntimeConfig, runMigrations, RuntimeAuth, type RuntimeConfig } from 'issus_runtime/server';
import { createCoreHttpRouter, coreAuthentication, coreHttpError, type CoreHttpOptions } from '../../http/auth/index.js';
import { installCompactRoutes } from '../../http/compact/index.js';

/** P4 HTTP/auth wiring; P5 supplies channel authorization, callbacks and reaction queues. */
export function brokerOptions(env: AgentEnv, core: CoreHttpOptions): EventBrokerOptions {
  return {
    env,
    verifier: core.auth,
    allowedActions: [],
    ingressQueues: [], // P5 placeholder.
    // P5 placeholder: reactions, onSubscribe, onReceipt and historyReader.
    authorizeChannel: () => false,
    clientDir: fileURLToPath(new URL('../../../front/', import.meta.url)),
    ready: async () => {
      if (!core.health || !(await core.health.ready()).ok) throw new Error('issus is not ready');
    },
    extendHttp: app => {
      app.use(createCoreHttpRouter(core));
      const compact = Router();
      compact.use('/v1', coreAuthentication(core));
      installCompactRoutes(compact, core);
      app.use(compact);
      app.use(coreHttpError);
    }
  };
}

export interface BrokerInput {
  config: RuntimeConfig;
  env: AgentEnv;
  baselineSql: string;
  bootstrapTokenHash: string;
  /** Dedicated integration namespace; production uses issus. */
  schema?: string;
}

/** Migration and bootstrap complete before the event broker opens its listener. */
export function createBroker(input: BrokerInput) {
  const { config, env } = input;
  const pool = createDatabasePool(config.DATABASE_URL, env.databasePoolMax);
  const eventStore = new EventStore(pool, undefined, { retentionDays: null, cursorTtlDays: env.cursorTtlDays });
  const queue = new PgmqClient(pool);
  const uow = new EventUnitOfWork({ pool, eventStore, queue, schema: input.schema });
  const auth = new RuntimeAuth({ uow, sessionTtlSeconds: config.ISSUS_SESSION_TTL_SECONDS });
  const intake = new IntakeService({ uow, resolvePrincipal: actor => auth.resolveActor(actor), publication: compactPublication });
  let initialized = false;
  const healthInput = { pool, schema: input.schema, initialized: () => initialized };
  const health = createHealth(healthInput);
  const options = brokerOptions(env, { intake, auth, health, origin: config.ISSUS_ORIGIN, historyReader: readCompactHistory });
  const mountHttp = options.extendHttp!;
  options.extendHttp = (app, database) => {
    // Reuse the broker pool after the separate migration connection has done its work.
    uow.options.pool = database;
    healthInput.pool = database;
    mountHttp(app, database);
  };
  let broker: Service | undefined;
  let stopped = false;
  let initializationPoolClosed = false;
  const closeInitializationPool = async () => {
    if (initializationPoolClosed) return;
    initializationPoolClosed = true;
    await pool.end();
  };
  const service: Service = {
    async start() {
      try {
        await runMigrations({ pool, schema: input.schema, baselineSql: input.baselineSql, ensureBroker: () => eventStore.ensureSchema() });
        await auth.installBootstrap(config.ISSUS_OWNER, input.bootstrapTokenHash);
        broker = createEventBroker(options);
        await broker.start();
        await closeInitializationPool();
        initialized = true;
      } catch (error) {
        await service.stop();
        throw error;
      }
    },
    async stop() {
      initialized = false;
      if (stopped) return;
      stopped = true;
      try { await broker?.stop(); } finally { await closeInitializationPool(); }
    }
  };
  return { service, intake, auth, health, options };
}

/** Validate environment, hash the operator secret without logging it, then start. */
export async function start() {
  const config = parseRuntimeConfig({ ...process.env, ISSUS_ORIGIN: process.env.ISSUS_ALLOWED_ORIGIN ?? process.env.ISSUS_ORIGIN });
  const env = readEnv({ ...process.env, AGENT_ROLE: 'broker', AGENT_QUEUE: QUEUES.intake, ISSUS_EVENT_RETENTION_DAYS: 'null' });
  const token = (await readFile(config.ISSUS_BOOTSTRAP_TOKEN_FILE, 'utf8')).trim();
  if (!token) throw new Error('bootstrap token file is empty');
  const baselineSql = await readFile(new URL('../../../migrations/0001-domain-baseline.sql', import.meta.url), 'utf8');
  const runtime = createBroker({ config, env, baselineSql, bootstrapTokenHash: sha256(token) });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
    const deadline = setTimeout(() => process.exit(1), 25000);
    deadline.unref();
    void runtime.service.stop().then(() => process.exit(0)).catch(() => process.exit(1));
  });
  await runtime.service.start();
  return runtime;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void start().catch(() => { console.error('issus startup failed'); process.exit(1); });
}
