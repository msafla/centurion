import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app';
import { fixedClock } from '../../src/server/clock';
import { loadConfig } from '../../src/server/config';
import { openDatabase } from '../../src/server/db/database';
import { Runtime } from '../../src/server/runtime';
import { OperationGate } from '../../src/server/storage/operation-gate';
import { canonicalDataDir, ensurePrivateDir } from '../../src/server/storage/paths';

const HOST = '127.0.0.1:4317';
const CLOCK = '2028-04-15T10:00:00.000Z';

const apps: FastifyInstance[] = [];
const dirs: string[] = [];

afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

async function makeApp(): Promise<FastifyInstance> {
  const raw = mkdtempSync(join(tmpdir(), 'centurion-serving-'));
  dirs.push(raw);
  const dataDir = canonicalDataDir(raw);
  ensurePrivateDir(dataDir);
  const webDistDir = join(raw, 'web');
  mkdirSync(webDistDir);
  writeFileSync(join(webDistDir, 'index.html'), '<!doctype html><title>CENTURION</title>');
  const db = openDatabase(join(dataDir, 'centurion.sqlite'));
  const runtime = new Runtime(
    loadConfig({}, { dataDir, webDistDir }),
    fixedClock(CLOCK),
    dataDir,
    new OperationGate(),
    db,
    randomUUID(),
  );
  const app = await buildApp({ config: runtime.config, clock: runtime.clock, runtime });
  await app.ready();
  apps.push(app);
  return app;
}

describe('SPA serving', () => {
  it('serves index.html on every deep route and JSON 404 on unknown API paths', async () => {
    const app = await makeApp();
    for (const path of [
      '/',
      '/search',
      '/plan',
      '/trends',
      '/references',
      '/archived',
      '/reporting',
      '/import',
      '/settings',
      '/control/any-id',
    ]) {
      const res = await app.inject({ method: 'GET', url: path, headers: { host: HOST } });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    }
    const api = await app.inject({ method: 'GET', url: '/api/nope', headers: { host: HOST } });
    expect(api.statusCode).toBe(404);
    expect(api.headers['content-type']).toContain('application/json');
  });
});
