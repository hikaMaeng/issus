import { readFile } from 'node:fs/promises';
import { Router } from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatabasePool, createEventBroker, EventStore, PgmqClient, readEnv, type AgentEnv, type EventBrokerOptions, type Service } from 'agent/broker';
import { QUEUES } from 'issus_domain/common';
import { compactPublication, DeliveryCommandService, InboxService, EventUnitOfWork, IntakeService, sha256 } from 'issus_domain/server';
import { createHealth, parseRuntimeConfig, runMigrations, RuntimeAuth, type RuntimeConfig } from 'issus_runtime/server';
import { createCoreHttpRouter, coreAuthentication, coreHttpError, type CoreHttpOptions } from '../../http/auth/index.js';
import { installCompactRoutes } from '../../http/compact/index.js';
import { createDeliveryHttpRouter, createInboxHistoryReader, type DeliveryHttpServices } from '../../http/inbox/index.js';
import { SubscriptionService } from '../../http/subscriptions/index.js';
import { createStreamCallbacks } from '../../stream/callbacks/index.js';
import { createSseRouter, createSseRuntime, type SseRuntime } from '../../stream/sse/index.js';
import { reactions, reactionsName } from '../../reactions/table/index.js';
import { ingressQueues, ingressQueueFor } from '../../reactions/queues/index.js';

export interface BrokerServices extends DeliveryHttpServices {
  stream: ReturnType<typeof createStreamCallbacks>;
  openSse(database: Parameters<typeof createSseRuntime>[0]): SseRuntime;
}

/** One authenticated HTTP/WS/SSE surface; clients cannot submit WS commands. */
export function brokerOptions(env: AgentEnv, core: CoreHttpOptions, services: BrokerServices,
  queueName: (name: string) => string = name => name, name = reactionsName): EventBrokerOptions {
  return {
    env,
    verifier: core.auth,
    allowedActions: [],
    ingressQueues: ingressQueues.map(queueName),
    ingressQueueFor: action => queueName(ingressQueueFor(action)),
    reactions: Object.fromEntries(Object.entries(reactions).map(([action, queues]) => [action, queues.map(queueName)])),
    reactionsName: name,
    ...services.stream,
    clientDir: fileURLToPath(new URL('../../../front/', import.meta.url)),
    ready: async () => {
      if (!core.health || !(await core.health.ready()).ok) throw new Error('issus is not ready');
    },
    extendHttp: (app, database) => {
      app.use(createDeliveryHttpRouter(core, services));
      app.use(createSseRouter(core, services.subscriptions, services.openSse(database), services.stream));
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
  /** Maps every ingress/reaction queue consistently in isolated integration tests. */
  queueName?: (name: string) => string;
}

/** Migration and bootstrap complete before the event broker opens its listener. */
export function createBroker(input: BrokerInput) {
  const { config, env } = input;
  const pool = createDatabasePool(config.DATABASE_URL, env.databasePoolMax);
  const eventStore = new EventStore(pool, undefined, { retentionDays: null, cursorTtlDays: env.cursorTtlDays });
  const queue = new PgmqClient(pool);
  const uow = new EventUnitOfWork({ pool, eventStore, queue, schema: input.schema, queueName: input.queueName });
  const auth = new RuntimeAuth({ uow, sessionTtlSeconds: config.ISSUS_SESSION_TTL_SECONDS });
  const intake = new IntakeService({ uow, resolvePrincipal: actor => auth.resolveActor(actor), publication: compactPublication });
  const deliveries = new DeliveryCommandService({ uow, resolvePrincipal: actor => auth.resolveActor(actor) });
  const inbox = new InboxService(uow);
  const subscriptions = new SubscriptionService(uow, inbox);
  const streamInput = { auth, subscriptions, store: eventStore, origin: config.ISSUS_ORIGIN };
  const stream = createStreamCallbacks(streamInput);
  auth.options.onRevoked = stream.onSessionRevoked;
  let sse: SseRuntime | undefined;
  let initialized = false;
  const healthInput = { pool, schema: input.schema, queueName: input.queueName, initialized: () => initialized };
  const health = createHealth(healthInput);
  const options = brokerOptions(env, { intake, auth, health, origin: config.ISSUS_ORIGIN, historyReader: createInboxHistoryReader(inbox) }, {
    deliveries, inbox, subscriptions, stream,
    openSse(database) {
      sse = createSseRuntime(database);
      streamInput.store = sse.store;
      return sse;
    }
  }, input.queueName, input.schema ? `${reactionsName}:${input.schema}` : reactionsName);
  const mountHttp = options.extendHttp!;
  options.extendHttp = (app, database) => {
    // Reuse the broker pool after the separate migration connection has done its work.
    uow.options.pool = database;
    uow.options.eventStore = new EventStore(database, undefined, { retentionDays: null, cursorTtlDays: env.cursorTtlDays });
    uow.options.queue = new PgmqClient(database);
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
        await runMigrations({ pool, schema: input.schema, queueName: input.queueName, baselineSql: input.baselineSql, ensureBroker: () => eventStore.ensureSchema() });
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
      try { await sse?.stop(); } finally {
        try { await broker?.stop(); } finally { await closeInitializationPool(); }
      }
    }
  };
  return { service, intake, auth, health, options, deliveries, inbox, subscriptions };
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
