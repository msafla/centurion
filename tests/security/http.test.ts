import { networkInterfaces } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../../src/server/app';
import { fixedClock } from '../../src/server/clock';
import { loadConfig } from '../../src/server/config';
import { parseInput } from '../../src/server/http/errors';

const HOST = '127.0.0.1:4317';
const ORIGIN = 'http://127.0.0.1:4317';
const CLOCK = '2028-04-15T10:00:00.000Z';

const apps: FastifyInstance[] = [];

async function makeApp(): Promise<FastifyInstance> {
  const config = loadConfig(
    {},
    { webDistDir: '/nonexistent-centurion-web', dataDir: '/tmp/centurion-t1' },
  );
  const app = await buildApp({ config, clock: fixedClock(CLOCK) });
  app.post('/api/_probe', async (request) =>
    parseInput(z.object({ name: z.string().max(10) }).strict(), request.body),
  );
  app.get('/api/_boom', async () => {
    throw new Error('boom at /mnt/c/Workspace/CENTURION/secret.ts');
  });
  await app.ready();
  apps.push(app);
  return app;
}

function mutationHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    host: HOST,
    origin: ORIGIN,
    'x-centurion-request': '1',
    'content-type': 'application/json',
    ...extra,
  };
}

afterEach(async () => {
  while (apps.length > 0) {
    const app = apps.pop();
    if (app) await app.close();
  }
});

describe('host boundary', () => {
  it('answers /health with the schema version', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/health', headers: { host: HOST } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', schema_version: 1 });
  });

  it('refuses a hostile Host header', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'evil.example:4317' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('browser mutation guards', () => {
  it('refuses a mutation with no Origin', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/_probe',
      headers: { host: HOST, 'x-centurion-request': '1', 'content-type': 'application/json' },
      payload: { name: 'ok' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses a foreign Origin and a null Origin', async () => {
    const app = await makeApp();
    const foreign = await app.inject({
      method: 'POST',
      url: '/api/_probe',
      headers: mutationHeaders({ origin: 'http://evil.example' }),
      payload: { name: 'ok' },
    });
    expect(foreign.statusCode).toBe(403);
    const nullOrigin = await app.inject({
      method: 'POST',
      url: '/api/_probe',
      headers: mutationHeaders({ origin: 'null' }),
      payload: { name: 'ok' },
    });
    expect(nullOrigin.statusCode).toBe(403);
  });

  it('refuses a mutation without the X-Centurion-Request header', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/_probe',
      headers: { host: HOST, origin: ORIGIN, 'content-type': 'application/json' },
      payload: { name: 'ok' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses a cross-site fetch', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/_probe',
      headers: mutationHeaders({ 'sec-fetch-site': 'cross-site' }),
      payload: { name: 'ok' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses a text/plain content type with 415', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/_probe',
      headers: mutationHeaders({ 'content-type': 'text/plain' }),
      payload: 'hello',
    });
    expect(res.statusCode).toBe(415);
  });

  it('refuses cross-site GET through Origin and Fetch Metadata', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { host: HOST, origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('accepts a well-formed mutation', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/_probe',
      headers: mutationHeaders(),
      payload: { name: 'ok' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: 'ok' });
  });
});

describe('body and schema errors', () => {
  it('returns 400 for malformed JSON', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/_probe',
      headers: mutationHeaders(),
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 422 with fields for an unknown field', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/_probe',
      headers: mutationHeaders(),
      payload: { name: 'ok', extra: 1 },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { error: { code: string; fields: Record<string, string[]> } };
    expect(body.error.code).toBe('validation_error');
    expect(Object.keys(body.error.fields).length).toBeGreaterThan(0);
  });

  it('returns 413 for a body larger than 64 KiB', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/_probe',
      headers: mutationHeaders(),
      payload: JSON.stringify({ name: 'x'.repeat(70 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
  });
});

describe('routing errors', () => {
  it('returns 405 with Allow for a known path and wrong method', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'PUT', url: '/health', headers: { host: HOST } });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toContain('GET');
  });

  it('returns JSON 404 for an unknown API route', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/unknown', headers: { host: HOST } });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('never leaks stack, path or payload on a 500', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/_boom', headers: { host: HOST } });
    expect(res.statusCode).toBe(500);
    const text = res.body;
    expect(text).not.toContain('stack');
    expect(text).not.toContain('/mnt/c');
    expect(text).not.toContain('secret.ts');
    expect(text).not.toContain('boom at');
  });
});

describe('loopback binding', () => {
  it('listens on 127.0.0.1 only and refuses the LAN address', async () => {
    const port = 20_000 + Math.floor(Math.random() * 10_000);
    const config = loadConfig(
      {},
      {
        webDistDir: '/nonexistent-centurion-web',
        dataDir: '/tmp/centurion-t1',
        port,
        allowedHosts: [`127.0.0.1:${port}`],
      },
    );
    const app = await buildApp({ config, clock: fixedClock(CLOCK) });
    await app.listen({ host: '127.0.0.1', port });
    try {
      const ok = await fetch(`http://127.0.0.1:${port}/health`);
      expect(ok.status).toBe(200);

      const lan = Object.values(networkInterfaces())
        .flat()
        .find((entry) => entry && entry.family === 'IPv4' && !entry.internal)?.address;
      if (lan) {
        await expect(
          fetch(`http://${lan}:${port}/health`, { signal: AbortSignal.timeout(2000) }),
        ).rejects.toThrow();
      }
    } finally {
      await app.close();
    }
  });
});
