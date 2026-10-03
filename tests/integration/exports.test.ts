import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { extractText, getDocumentProxy } from 'unpdf';
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
  const raw = mkdtempSync(join(tmpdir(), 'centurion-export-'));
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

function headers(): Record<string, string> {
  return {
    host: HOST,
    origin: ORIGIN,
    'x-centurion-request': '1',
    'content-type': 'application/json',
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

async function createPlan(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/plans',
    headers: headers(),
    payload: { year: 2028, name: 'Plan annuel 2028', perimeter: '' },
  });
  return (res.json() as { id: string }).id;
}

async function createControl(
  app: FastifyInstance,
  planId: string,
  code: string,
  dates: string[],
  title = 'Titre',
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/plans/${planId}/controls`,
    headers: headers(),
    payload: { ...metadata, title, code, schedule: { kind: 'explicit', dates } },
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

describe('CSV export', () => {
  it('exports all filtered occurrences with BOM, semicolon and neutralized formulas', async () => {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);
    const controlId = await createControl(app, planId, 'C1', [
      '2028-01-01',
      '2028-02-01',
      '2028-03-01',
    ]);
    const db = runtime.db.db;
    db.prepare(
      `INSERT INTO realizations (id, occurrence_id, completed_date, fait, conformite, comment, evidence_ref, created_at, updated_at)
       VALUES (?, ?, '2028-03-01', 1, 'conforme', '', NULL, ?, ?)`,
    ).run(randomUUID(), occId(db, controlId, '2028-03-01'), CLOCK, CLOCK);
    db.prepare(
      `INSERT INTO realizations (id, occurrence_id, completed_date, fait, conformite, comment, evidence_ref, created_at, updated_at)
       VALUES (?, ?, '2028-02-01', 0, 'non_applicable', '', NULL, ?, ?)`,
    ).run(randomUUID(), occId(db, controlId, '2028-02-01'), CLOCK, CLOCK);

    await createControl(app, planId, 'FORMULA', ['2028-04-01'], '  =SUM(A1)');

    const res = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/exports/controls.csv`,
      headers: { host: HOST },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');

    const text = res.body;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.split('\r\n').filter(Boolean);
    expect(lines[0]).toContain('"code";"title"');
    // 3 occurrences for C1 + 1 for FORMULA.
    expect(lines.length).toBe(1 + 4);
    expect(text).toContain('"Oui";"conforme"');
    expect(text).toContain('"Non";"N/A"');
    // Formula neutralized at export time only (stored text is trimmed by the schema).
    expect(text).toContain("'=SUM(A1)");
    const stored = db.prepare('SELECT title FROM controls WHERE code = ?').get('FORMULA') as {
      title: string;
    };
    expect(stored.title).toBe('=SUM(A1)');
  });

  it('never includes rows from another plan', async () => {
    const { app } = await makeApp();
    const planId = await createPlan(app);
    await createControl(app, planId, 'C1', ['2028-01-01']);
    const other = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: headers(),
      payload: { year: 2029, name: 'Plan annuel 2029', perimeter: '' },
    });
    const otherPlan = (other.json() as { id: string }).id;
    await createControl(app, otherPlan, 'OTHER', ['2029-01-01']);

    const res = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/exports/controls.csv`,
      headers: { host: HOST },
    });
    expect(res.body).toContain('C1');
    expect(res.body).not.toContain('OTHER');
  });
});

function allDaysOf2028(): string[] {
  const days: string[] = [];
  const monthLengths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= (monthLengths[month - 1] ?? 0); day += 1) {
      days.push(`2028-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
  }
  return days;
}

describe('PDF export', () => {
  it('renders a valid PDF with the required mention and rejects over 1000 rows', async () => {
    const { app } = await makeApp();
    const planId = await createPlan(app);
    await createControl(app, planId, 'C1', ['2028-01-01', '2028-02-01']);

    const ok = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/exports/report.pdf`,
      headers: { host: HOST },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toContain('application/pdf');
    expect(ok.rawPayload.subarray(0, 4).toString('latin1')).toBe('%PDF');

    const document = await getDocumentProxy(new Uint8Array(ok.rawPayload));
    const { text } = await extractText(document, { mergePages: true });
    expect(text).toContain('CENTURION');
    expect(text).toContain("ne constitue pas une opinion d'assurance");

    const days = allDaysOf2028();
    for (const code of ['BIG1', 'BIG2', 'BIG3']) {
      await createControl(app, planId, code, days);
    }
    const tooLarge = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/exports/report.pdf`,
      headers: { host: HOST },
    });
    expect(tooLarge.statusCode).toBe(422);
    expect((tooLarge.json() as { error: { code: string } }).error.code).toBe('report_too_large');
  }, 120_000);
});
