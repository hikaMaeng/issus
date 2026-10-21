import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sql = readFileSync('docker/postgres/initdb/001-extensions.sql', 'utf8');
if (sql.trim() !== 'CREATE EXTENSION IF NOT EXISTS pgmq;') throw new Error('unexpected infrastructure SQL');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/manifest.json', JSON.stringify({ name: 'issus-db', image: 'ghcr.io/pgmq/pg18-pgmq:v1.10.0', initdbSha256: createHash('sha256').update(sql).digest('hex') }, null, 2) + '\n', 'utf8');
