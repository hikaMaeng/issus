import express from 'express';
import envSchema from 'env-schema';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** P1 scaffold server; functional readiness is installed by P4/P5. */
export function createApp() {
  const app = express();
  app.get('/health', (_req, res) => res.status(200).json({ ok: true, service: 'issus' }));
  app.get('/ready', (_req, res) => res.status(200).json({ ok: true, stage: 'scaffold' }));
  const front = fileURLToPath(new URL('../../../front/', import.meta.url));
  app.use(express.static(front));
  app.get('/', (_req, res) => res.sendFile(resolve(front, 'index.html')));

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
  const server = createApp().listen(config.PORT, config.HOST, () => console.log('issus listening'));
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 25000).unref();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
