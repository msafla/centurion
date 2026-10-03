import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { extractText, getDocumentProxy } from 'unpdf';
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
  referentials: ['iso_27001'],
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
  it('renders a structured, paginated PDF and rejects over 1000 rows', async () => {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);
    const controlId = await createControl(app, planId, 'C1', ['2028-01-01', '2028-02-01']);
    runtime.db.db
      .prepare(
        `INSERT INTO realizations (id, occurrence_id, completed_date, fait, conformite, comment, evidence_ref, created_at, updated_at)
         VALUES (?, ?, '2028-01-01', 1, 'conforme', ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        occId(runtime.db.db, controlId, '2028-01-01'),
        '<script>alert(1)</script> éàç',
        '<b>preuve</b> & données',
        CLOCK,
        CLOCK,
      );

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const ok = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/exports/report.pdf`,
      headers: { host: HOST },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toContain('application/pdf');
    expect(ok.rawPayload.subarray(0, 4).toString('latin1')).toBe('%PDF');

    const document = await getDocumentProxy(new Uint8Array(ok.rawPayload));
    const { text } = await extractText(document, { mergePages: true });
    const flat = text.replace(/\s+/g, ' ');
    // Structure and summary
    expect(text).toContain('Rapport CENTURION');
    expect(text).toContain('Plan annuel 2028');
    expect(text).toContain('Synthèse');
    expect(text).toContain('Occurrences');
    expect(text).toContain('Référentiel');
    expect(text).toContain('Code / titre');
    expect(text).toContain('Conformité');
    expect(text).toContain('Conforme');
    // Details, accents and pagination
    expect(text).toContain('Détails des réalisations');
    expect(text).toContain('éàç');
    expect(text).toMatch(/Page\s*1\s*\/\s*\d+/);
    // User values are literal text, not interpreted markup
    expect(text).toContain('<script>alert(1)</script>');
    expect(text).toContain('<b>preuve</b> & données');
    expect(flat).toContain("ne constitue pas une opinion d'assurance");
    expect(document.numPages).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('renders an empty report and preserves long, Unicode and markup text', async () => {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);
    const controlId = await createControl(app, planId, 'C1', ['2028-01-01']);
    const longComment = `${'mot '.repeat(450)}${'éàçüö '.repeat(50)}fin-de-commentaire`;
    runtime.db.db
      .prepare(
        `INSERT INTO realizations (id, occurrence_id, completed_date, fait, conformite, comment, evidence_ref, created_at, updated_at)
         VALUES (?, ?, '2028-01-01', 1, 'partiellement_conforme', ?, ?, ?, ?)`,
      )
      .run(randomUUID(), occId(runtime.db.db, controlId, '2028-01-01'), longComment, '<>& <b>preuve</b>', CLOCK, CLOCK);

    const res = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/exports/report.pdf`,
      headers: { host: HOST },
    });
    expect(res.statusCode).toBe(200);
    const document = await getDocumentProxy(new Uint8Array(res.rawPayload));
    const { text } = await extractText(document, { mergePages: true });
    const compact = text.replace(/\s+/g, '');
    expect(compact).toContain('mot'.repeat(200));
    expect(compact).toContain('éàçüö');
    expect(compact).toContain('fin-de-commentaire');
    expect(text).toContain('<>&');
    expect(text).toContain('Partiellement conforme');
    expect(document.numPages).toBeGreaterThanOrEqual(2);

    const empty = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/exports/report.pdf`,
      headers: { host: HOST },
      query: { search: 'zzzzz' },
    });
    expect(empty.statusCode).toBe(200);
    const emptyDocument = await getDocumentProxy(new Uint8Array(empty.rawPayload));
    const { text: emptyText } = await extractText(emptyDocument, { mergePages: true });
    expect(emptyText).toContain('Aucune occurrence pour ces filtres');
    expect(emptyText.replace(/\s+/g, ' ')).toContain("ne constitue pas une opinion d'assurance");
    expect(emptyDocument.numPages).toBeGreaterThanOrEqual(1);
  }, 180_000);

  it('admits 1000 occurrences and rejects 1001 before rendering', async () => {
    const { app } = await makeApp();
    const planId = await createPlan(app);
    const days = allDaysOf2028();
    await createControl(app, planId, 'BIG1', days);
    await createControl(app, planId, 'BIG2', days);
    await createControl(app, planId, 'BIG3', days.slice(0, 268));

    const admitted = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/exports/report.pdf`,
      headers: { host: HOST },
    });
    expect(admitted.statusCode).toBe(200);
    expect(admitted.rawPayload.byteLength).toBeLessThanOrEqual(64 * 1024 * 1024);

    await createControl(app, planId, 'OVER', ['2028-01-01']);
    const tooLarge = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/exports/report.pdf`,
      headers: { host: HOST },
    });
    expect(tooLarge.statusCode).toBe(422);
    expect((tooLarge.json() as { error: { code: string } }).error.code).toBe('report_too_large');
  }, 300_000);
});
