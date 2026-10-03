import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
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
      // ignore
    }
  }
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

async function makeApp(): Promise<{ app: FastifyInstance; runtime: Runtime }> {
  const raw = mkdtempSync(join(tmpdir(), 'centurion-report-'));
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

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    host: HOST,
    origin: ORIGIN,
    'x-centurion-request': '1',
    'content-type': 'application/json',
    ...extra,
  };
}

const metadata = {
  title: 'Titre',
  description: 'Description',
  referentiel: 'iso_27001',
  reference: 'REF',
  domain: 'Domaine',
  owner_name: '',
  method: '',
  expected_evidence: '',
  automated: false,
  automation_github_url: null,
  active_from: null,
  active_to: null,
};

async function createPlan(app: FastifyInstance, year = 2028): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/plans',
    headers: headers(),
    payload: { year, name: `Plan annuel ${year}`, perimeter: '' },
  });
  return (res.json() as { id: string }).id;
}

async function createControl(
  app: FastifyInstance,
  planId: string,
  code: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/plans/${planId}/controls`,
    headers: headers(),
    payload: { ...metadata, code, schedule: { kind: 'explicit', dates: ['2028-01-01'] }, ...overrides },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { control: { id: string } }).control.id;
}

function occId(db: BetterSqlite3.Database, controlId: string, date: string): string {
  return (
    db
      .prepare('SELECT id FROM occurrences WHERE control_id = ? AND occurrence_date = ?')
      .get(controlId, date) as { id: string }
  ).id;
}

function realization(
  db: BetterSqlite3.Database,
  occurrenceId: string,
  fait: number,
  conformite: string,
): void {
  db.prepare(
    `INSERT INTO realizations (id, occurrence_id, completed_date, fait, conformite, comment, evidence_ref, created_at, updated_at)
     VALUES (?, ?, '2028-04-15', ?, ?, '', NULL, ?, ?)`,
  ).run(randomUUID(), occurrenceId, fait, conformite, CLOCK, CLOCK);
}

describe('metrics fixture', () => {
  async function seedFixture() {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);
    const controlId = await createControl(app, planId, 'C1', {
      schedule: {
        kind: 'explicit',
        dates: ['2028-01-01', '2028-02-01', '2028-03-01', '2028-04-01', '2028-05-01', '2028-06-01', '2028-07-01'],
      },
    });
    const db = runtime.db.db;
    realization(db, occId(db, controlId, '2028-03-01'), 1, 'conforme');
    realization(db, occId(db, controlId, '2028-04-01'), 1, 'non_conforme');
    realization(db, occId(db, controlId, '2028-05-01'), 1, 'non_applicable');
    realization(db, occId(db, controlId, '2028-06-01'), 0, 'non_applicable');
    db.prepare("UPDATE occurrences SET state='superseded' WHERE id = ?").run(
      occId(db, controlId, '2028-07-01'),
    );
    return { app, runtime, planId };
  }

  it('computes counts and rates over the filtered occurrences', async () => {
    const { app, planId } = await seedFixture();
    const res = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/summary`,
      headers: { host: HOST },
    });
    expect(res.statusCode).toBe(200);
    const summary = res.json() as {
      counts: Record<string, number>;
      realization_rate: { value: number };
      conformity_rate: { value: number };
    };
    expect(summary.counts).toEqual({
      total: 6,
      open: 2,
      fait_true: 3,
      fait_false: 1,
      conforme: 1,
      partiellement_conforme: 0,
      non_conforme: 1,
      non_applicable: 1,
    });
    expect(summary.realization_rate.value).toBeCloseTo(0.5);
    expect(summary.conformity_rate.value).toBeCloseTo(0.5);
  });

  it('returns null rates for an empty result and for only N/A', async () => {
    const { app, planId } = await seedFixture();
    const empty = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/summary`,
      headers: { host: HOST },
      query: { search: 'zzzzz' },
    });
    const emptySummary = empty.json() as {
      counts: { total: number };
      realization_rate: { value: number | null };
      conformity_rate: { value: number | null };
    };
    expect(emptySummary.counts.total).toBe(0);
    expect(emptySummary.realization_rate.value).toBeNull();
    expect(emptySummary.conformity_rate.value).toBeNull();

    const na = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/summary`,
      headers: { host: HOST },
      query: { conformite: 'non_applicable' },
    });
    const naSummary = na.json() as { conformity_rate: { value: number | null } };
    expect(naSummary.conformity_rate.value).toBeNull();
  });

  it('returns the same global summary on both report pages', async () => {
    const { app, planId } = await seedFixture();
    const page1 = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/report`,
      headers: { host: HOST },
      query: { page: '1', page_size: '2' },
    });
    const page2 = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/report`,
      headers: { host: HOST },
      query: { page: '2', page_size: '2' },
    });
    expect((page1.json() as { summary: unknown }).summary).toEqual(
      (page2.json() as { summary: unknown }).summary,
    );
    expect((page1.json() as { rows: { items: unknown[] } }).rows.items.length).toBe(2);
  });

  it('excludes another plan and searches LIKE characters literally', async () => {
    const { app, planId } = await seedFixture();
    const otherPlan = await createPlan(app, 2029);
    await createControl(app, otherPlan, 'OTHER', {
      schedule: { kind: 'explicit', dates: ['2029-01-01'] },
    });

    const summary = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/summary`,
      headers: { host: HOST },
    });
    expect((summary.json() as { counts: { total: number } }).counts.total).toBe(6);

    await createControl(app, planId, 'PCT', { title: 'Taux 100%' });
    await createControl(app, planId, 'X', { title: 'Taux 100x' });
    const search = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/summary`,
      headers: { host: HOST },
      query: { search: '100%' },
    });
    const counts = (search.json() as { counts: { total: number } }).counts;
    expect(counts.total).toBe(1);
  });
});

describe('automation rate', () => {
  it('counts active controls, with or without an occurrence filter', async () => {
    const { app } = await makeApp();
    const planId = await createPlan(app);
    await createControl(app, planId, 'A', {
      schedule: { kind: 'explicit', dates: ['2028-01-01'] },
      automated: false,
    });
    await createControl(app, planId, 'B', {
      schedule: { kind: 'explicit', dates: ['2028-02-01'] },
      automated: true,
      automation_github_url: 'https://github.com/org/repo',
    });
    await createControl(app, planId, 'C', {
      schedule: { kind: 'explicit', dates: ['2028-01-01'] },
      active_from: '2028-06-01',
      active_to: '2028-06-30',
      automated: true,
      automation_github_url: 'https://github.com/org/repo',
    });

    const all = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/summary`,
      headers: { host: HOST },
    });
    const automation = (all.json() as { automation_rate: { numerator: number; denominator: number } })
      .automation_rate;
    expect(automation).toEqual({ numerator: 2, denominator: 3, value: 2 / 3 });

    const withOccurrence = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/summary`,
      headers: { host: HOST },
      query: { state: 'open' },
    });
    const filtered = (
      withOccurrence.json() as { automation_rate: { numerator: number; denominator: number } }
    ).automation_rate;
    expect(filtered.denominator).toBe(2);
    expect(filtered.numerator).toBe(1);
  });
});
