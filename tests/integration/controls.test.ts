import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/server/app';
import { fixedClock } from '../../src/server/clock';
import { loadConfig } from '../../src/server/config';
import { openDatabase } from '../../src/server/db/database';
import { Runtime } from '../../src/server/runtime';
import { OperationGate } from '../../src/server/storage/operation-gate';
import { canonicalDataDir, ensurePrivateDir } from '../../src/server/storage/paths';

const HOST = '127.0.0.1:4317';
const ORIGIN = 'http://127.0.0.1:4317';
const CLOCK = '2028-04-15T10:00:00.000Z';

const apps: FastifyInstance[] = [];
const runtimes: Runtime[] = [];
const dirs: string[] = [];

afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close();
  while (runtimes.length > 0) {
    try {
      runtimes.pop()?.db.close();
    } catch {
      // already closed by a restore swap
    }
  }
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

async function makeApp(): Promise<{ app: FastifyInstance; runtime: Runtime }> {
  const raw = mkdtempSync(join(tmpdir(), 'centurion-controls-'));
  dirs.push(raw);
  const dataDir = canonicalDataDir(raw);
  ensurePrivateDir(dataDir);
  const db = openDatabase(join(dataDir, 'centurion.sqlite'));
  const runtime = new Runtime(
    loadConfig({}, { dataDir }),
    fixedClock(CLOCK),
    dataDir,
    new OperationGate(),
    db,
    randomUUID(),
  );
  const app = await buildApp({ config: runtime.config, clock: runtime.clock, runtime });
  await app.ready();
  apps.push(app);
  runtimes.push(runtime);
  return { app, runtime };
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

const baseControl = {
  title: 'Titre',
  description: 'Description',
  referentials: ['iso_27001'],
  reference: 'REF',
  domain: 'Domaine',
  owner_name: '',
  method: '',
  expected_evidence: '',
  automated: false,
  automation_github_url: null,
  schedule: { kind: 'quarterly', anchorDate: '2028-03-31' },
  active_from: null,
  active_to: null,
};

async function createPlan(app: FastifyInstance, year = 2028): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/plans',
    headers: mutationHeaders(),
    payload: { year, name: `Plan annuel ${year}`, perimeter: '' },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { id: string }).id;
}

describe('control creation', () => {
  it('creates a control and generates its occurrences', async () => {
    const { app } = await makeApp();
    const planId = await createPlan(app);
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: mutationHeaders(),
      payload: { ...baseControl, code: 'c1' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { control: { code: string }; occurrences_generated: number };
    expect(body.control.code).toBe('C1');
    expect(body.occurrences_generated).toBe(4);

    const list = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/controls`,
      headers: { host: HOST },
    });
    expect((list.json() as { total: number }).total).toBe(1);
  });

  it('returns 404 for a plan that does not exist', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${randomUUID()}/controls`,
      headers: mutationHeaders(),
      payload: { ...baseControl, code: 'C1' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 on a duplicate code after normalization', async () => {
    const { app } = await makeApp();
    const planId = await createPlan(app);
    const first = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: mutationHeaders(),
      payload: { ...baseControl, code: 'C1' },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: mutationHeaders(),
      payload: { ...baseControl, code: ' c1 ' },
    });
    expect(second.statusCode).toBe(409);
  });

  it('refuses a URL when automated is false and a bad URL when true, without fetching', async () => {
    const { app } = await makeApp();
    const planId = await createPlan(app);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: mutationHeaders(),
      payload: {
        ...baseControl,
        code: 'C1',
        automated: false,
        automation_github_url: 'https://github.com/org/repo',
      },
    });
    expect(forbidden.statusCode).toBe(422);

    for (const url of [
      'http://github.com/org/repo',
      'https://user@github.com/org/repo',
      'https://github.com:443/org/repo',
      'https://github.com.evil.com/org/repo',
      'https://github.com/org',
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/plans/${planId}/controls`,
        headers: mutationHeaders(),
        payload: { ...baseControl, code: 'C2', automated: true, automation_github_url: url },
      });
      expect(res.statusCode).toBe(422);
    }

    const ok = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: mutationHeaders(),
      payload: {
        ...baseControl,
        code: 'C3',
        automated: true,
        automation_github_url: 'https://github.com/org/repo',
      },
    });
    expect(ok.statusCode).toBe(201);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('refuses an out-of-year definition date with 422', async () => {
    const { app } = await makeApp();
    const planId = await createPlan(app, 2028);
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: mutationHeaders(),
      payload: { ...baseControl, code: 'C1', schedule: { kind: 'annual', anchorDate: '2029-01-01' } },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe('year clone', () => {
  it('refuses cloning an existing year', async () => {
    const { app } = await makeApp();
    const planId = await createPlan(app, 2028);
    await createPlan(app, 2029);
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/clone`,
      headers: mutationHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(409);
  });

  it('clones active controls and translates 29/02 to 28/02', async () => {
    const { app } = await makeApp();
    const planId = await createPlan(app, 2028);
    await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: mutationHeaders(),
      payload: { ...baseControl, code: 'LEAP', schedule: { kind: 'annual', anchorDate: '2028-02-29' } },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/clone`,
      headers: mutationHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      plan: { id: string; year: number };
      controls_created: number;
      occurrences_created: number;
    };
    expect(body.plan.year).toBe(2029);
    expect(body.controls_created).toBe(1);
    expect(body.occurrences_created).toBe(1);

    const occurrences = await app.inject({
      method: 'GET',
      url: `/api/plans/${body.plan.id}/controls`,
      headers: { host: HOST },
    });
    expect((occurrences.json() as { total: number }).total).toBe(1);
  });
});

describe('occurrence cap', () => {
  it('admits 100000 active occurrences and refuses the 100001st without writing', async () => {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);
    const control = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: mutationHeaders(),
      payload: { ...baseControl, code: 'C1', schedule: { kind: 'once', date: '2028-01-01' } },
    });
    const controlId = (control.json() as { control: { id: string } }).control.id;

    const insert = runtime.db.db.prepare(
      `INSERT INTO occurrences (id, control_id, occurrence_date, state, created_at, updated_at)
       VALUES (?, ?, ?, 'open', ?, ?)`,
    );
    const seed = runtime.db.db.transaction(() => {
      for (let index = 0; index < 99_999; index += 1) {
        insert.run(randomUUID(), controlId, `2028-x-${index}`, CLOCK, CLOCK);
      }
    });
    seed();

    const total = runtime.db.db
      .prepare("SELECT COUNT(*) AS n FROM occurrences WHERE state IN ('open','completed')")
      .get() as { n: number };
    expect(total.n).toBe(100_000);

    const refused = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: mutationHeaders(),
      payload: { ...baseControl, code: 'C2', schedule: { kind: 'once', date: '2028-01-01' } },
    });
    expect(refused.statusCode).toBe(422);
    const controlCount = runtime.db.db.prepare('SELECT COUNT(*) AS n FROM controls').get() as {
      n: number;
    };
    expect(controlCount.n).toBe(1);
  });
});

describe('duplication', () => {
  it('copies no realization and no source audit', async () => {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);
    const created = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: mutationHeaders(),
      payload: { ...baseControl, code: 'C1', schedule: { kind: 'once', date: '2028-01-01' } },
    });
    const controlId = (created.json() as { control: { id: string } }).control.id;

    const occurrence = runtime.db.db
      .prepare('SELECT id FROM occurrences WHERE control_id = ?')
      .get(controlId) as { id: string };
    runtime.db.db
      .prepare(
        `INSERT INTO realizations (id, occurrence_id, completed_date, fait, conformite, comment, evidence_ref, created_at, updated_at)
         VALUES (?, ?, '2028-04-15', 1, 'conforme', '', NULL, ?, ?)`,
      )
      .run(randomUUID(), occurrence.id, CLOCK, CLOCK);

    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/duplicate`,
      headers: mutationHeaders(),
      payload: { new_code: 'C1-BIS' },
    });
    expect(res.statusCode).toBe(201);
    const newId = (res.json() as { control: { id: string } }).control.id;

    const states = runtime.db.db
      .prepare('SELECT state FROM occurrences WHERE control_id = ?')
      .all(newId) as { state: string }[];
    expect(states).toEqual([{ state: 'open' }]);

    const realizations = runtime.db.db
      .prepare(
        'SELECT COUNT(*) AS n FROM realizations r JOIN occurrences o ON o.id = r.occurrence_id WHERE o.control_id = ?',
      )
      .get(newId) as { n: number };
    expect(realizations.n).toBe(0);
  });
});
