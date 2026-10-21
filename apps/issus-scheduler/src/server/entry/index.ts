import express from 'express';
import envSchema from 'env-schema';
import { pathToFileURL } from 'node:url';
/** P1 scaffold server; functional readiness is installed by P4/P5. */
export function createApp() {
  const app = express();
  app.get('/health', (_req, res) => res.status(200).json({ ok: true, service: 'issus-scheduler' }));
  app.get('/ready', (_req, res) => res.status(200).json({ ok: true, stage: 'scaffold' }));
  return app;
}

/** Validate runtime listener configuration before opening a socket. */
export function start() {
  const config = envSchema<{ PORT: number; HOST: string }>({
    schema: { type: 'object', required: ['PORT'], properties: {
      PORT: { type: 'integer', minimum: 10000, maximum: 59999 },
      HOST: { type: 'string', default: '0.0.0.0', minLength: 1 }
    } }
  });
  const server = createApp().listen(config.PORT, config.HOST, () => console.log('issus-scheduler listening'));
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 25000).unref();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
