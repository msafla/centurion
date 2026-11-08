import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app';
import { fixedClock } from '../../src/server/clock';
import { loadConfig } from '../../src/server/config';

const HOST = '127.0.0.1:4317';
const ORIGIN = 'http://127.0.0.1:4317';
const CLOCK = '2028-04-15T10:00:00.000Z';

const apps: FastifyInstance[] = [];

async function makeApp(): Promise<FastifyInstance> {
  const config = loadConfig(
    {},
    { webDistDir: '/nonexistent-centurion-web', dataDir: '/tmp/centurion-sec-new' },
  );
  const app = await buildApp({ config, clock: fixedClock(CLOCK) });
  await app.ready();
  apps.push(app);
  return app;
}

afterEach(async () => {
  while (apps.length > 0) {
    const app = apps.pop();
    if (app) await app.close();
  }
});

function mutationHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    host: HOST,
    origin: ORIGIN,
    'x-centurion-request': '1',
    'content-type': 'application/json',
    ...extra,
  };
}

describe('guards on the new routes', () => {
  it('refuses POST /api/clauses without Origin', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/clauses',
      headers: { host: HOST, 'x-centurion-request': '1', 'content-type': 'application/json' },
      payload: { code: 'A.1', title: 'Clause' },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe('origin_required');
  });

  it('refuses PUT control clauses without the X-Centurion-Request header', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/plans/p/controls/c/clauses',
      headers: { host: HOST, origin: ORIGIN, 'content-type': 'application/json' },
      payload: { clause_ids: [] },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe('request_header_required');
  });

  it('refuses a text/plain POST /api/clauses with 415', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/clauses',
      headers: mutationHeaders({ 'content-type': 'text/plain' }),
      payload: 'code=A.1',
    });
    expect(res.statusCode).toBe(415);
  });

  it('refuses evidence upload and delete without browser mutation headers', async () => {
    const app = await makeApp();
    const base = '/api/plans/p/occurrences/o/evidence';
    const boundary = '----x';
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF\r\n--${boundary}--\r\n`,
    );
    const noOrigin = await app.inject({
      method: 'POST',
      url: base,
      headers: {
        host: HOST,
        'x-centurion-request': '1',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(noOrigin.statusCode).toBe(403);

    const noHeader = await app.inject({
      method: 'DELETE',
      url: `${base}/e`,
      headers: { host: HOST, origin: ORIGIN },
    });
    expect(noHeader.statusCode).toBe(403);
    expect((noHeader.json() as { error: { code: string } }).error.code).toBe('request_header_required');
  });

  it('refuses cross-site reads on /api/search, /api/trends, /api/clauses and evidence download', async () => {
    const app = await makeApp();
    const foreign = { host: HOST, origin: 'http://evil.example' };
    for (const url of [
      '/api/search?q=x',
      '/api/trends',
      '/api/clauses',
      '/api/plans/p/occurrences/o/evidence/e/download',
    ]) {
      const res = await app.inject({ method: 'GET', url, headers: foreign });
      expect(res.statusCode).toBe(403);
    }
    const crossSite = await app.inject({
      method: 'GET',
      url: '/api/trends',
      headers: { host: HOST, 'sec-fetch-site': 'cross-site' },
    });
    expect(crossSite.statusCode).toBe(403);
    expect((crossSite.json() as { error: { code: string } }).error.code).toBe('cross_site_forbidden');
  });
});
