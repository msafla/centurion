import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
  const raw = mkdtempSync(join(tmpdir(), 'centurion-new-'));
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

const readHeaders = { host: HOST };

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

const DATES = ['2028-01-31', '2028-03-31', '2028-06-30', '2028-09-30'];

async function setup(
  app: FastifyInstance,
  code = 'C1',
  schedule: unknown = { kind: 'explicit', dates: DATES },
): Promise<{ planId: string; controlId: string }> {
  const plan = await app.inject({
    method: 'POST',
    url: '/api/plans',
    headers: headers(),
    payload: { year: 2028, name: 'Plan annuel 2028', perimeter: '' },
  });
  const planId = (plan.json() as { id: string }).id;
  const control = await app.inject({
    method: 'POST',
    url: `/api/plans/${planId}/controls`,
    headers: headers(),
    payload: { ...metadata, code, schedule },
  });
  const controlId = (control.json() as { control: { id: string } }).control.id;
  return { planId, controlId };
}

function occurrenceId(db: BetterSqlite3.Database, controlId: string, date: string): string {
  return (
    db
      .prepare('SELECT id FROM occurrences WHERE control_id = ? AND occurrence_date = ?')
      .get(controlId, date) as { id: string }
  ).id;
}

async function completeOccurrence(
  app: FastifyInstance,
  planId: string,
  id: string,
  conformite = 'conforme',
): Promise<void> {
  const res = await app.inject({
    method: 'PUT',
    url: `/api/plans/${planId}/occurrences/${id}/status`,
    headers: headers(),
    payload: {
      fait: true,
      conformite,
      completed_date: '2028-04-15',
      comment: '',
      evidence_ref: null,
    },
  });
  expect(res.statusCode).toBe(200);
}

async function createClause(
  app: FastifyInstance,
  code: string,
  referentialSlug: string | null = null,
): Promise<{ id: string; code: string; referential: string | null }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/clauses',
    headers: headers(),
    payload: { referential_slug: referentialSlug, code, title: `Clause ${code}` },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; code: string; referential: string | null };
}

function multipartFile(
  content: Buffer,
  filename: string,
  mime: string,
  includeFile = true,
): { headers: Record<string, string>; payload: Buffer } {
  const boundary = '----centurionboundary';
  const parts: Buffer[] = [];
  if (includeFile) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
      ),
      content,
      Buffer.from('\r\n'),
    );
  } else {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\nrien\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    headers: {
      host: HOST,
      origin: ORIGIN,
      'x-centurion-request': '1',
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat(parts),
  };
}

describe('trends', () => {
  it('returns one point per plan ordered by year with summary counts', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setup(app);
    await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: headers(),
      payload: { year: 2027, name: 'Plan annuel 2027', perimeter: '' },
    });
    await completeOccurrence(app, planId, occurrenceId(runtime.db.db, controlId, '2028-01-31'));

    const res = await app.inject({ method: 'GET', url: '/api/trends', headers: readHeaders });
    expect(res.statusCode).toBe(200);
    const points = res.json() as Array<{
      plan_id: string;
      year: number;
      name: string;
      summary: { counts: Record<string, number>; by_clause: unknown[] };
    }>;
    expect(points.map((p) => p.year)).toEqual([2027, 2028]);
    const current = points.find((p) => p.year === 2028);
    expect(current?.plan_id).toBe(planId);
    expect(current?.summary.counts.total).toBe(4);
    expect(current?.summary.counts.open).toBe(3);
    expect(current?.summary.counts.fait_true).toBe(1);
    expect(current?.summary.counts.conforme).toBe(1);
  });

  it('applies occurrence filters to every plan and exposes clause coverage', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setup(app);
    const clause = await createClause(app, 'A.1.1', 'iso_27001');
    await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/controls/${controlId}/clauses`,
      headers: headers(),
      payload: { clause_ids: [clause.id] },
    });
    await completeOccurrence(app, planId, occurrenceId(runtime.db.db, controlId, '2028-01-31'));

    const filtered = await app.inject({
      method: 'GET',
      url: '/api/trends?state=open',
      headers: readHeaders,
    });
    expect(filtered.statusCode).toBe(200);
    const point = (filtered.json() as Array<{ year: number; summary: { counts: Record<string, number>; by_clause: Array<{ clause: { code: string }; counts: Record<string, number> }> } }>).find(
      (p) => p.year === 2028,
    );
    expect(point?.summary.counts.total).toBe(3);
    expect(point?.summary.by_clause).toHaveLength(1);
    expect(point?.summary.by_clause[0]?.clause.code).toBe('A.1.1');
    expect(point?.summary.by_clause[0]?.counts.total).toBe(3);

    const all = await app.inject({ method: 'GET', url: '/api/trends', headers: readHeaders });
    const byClause = (
      (all.json() as Array<{ year: number; summary: { by_clause: Array<{ clause: { code: string }; counts: Record<string, number> }> } }>).find(
        (p) => p.year === 2028,
      )?.summary.by_clause ?? []
    );
    expect(byClause[0]?.counts.conforme).toBe(1);
  });

  it('rejects an inverted date range with 422', async () => {
    const { app } = await makeApp();
    await setup(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/trends?date_from=2028-12-31&date_to=2028-01-01',
      headers: readHeaders,
    });
    expect(res.statusCode).toBe(422);
  });
});

describe('search', () => {
  it('matches code, title and description case-insensitively', async () => {
    const { app } = await makeApp();
    await setup(app, 'AC-1');
    for (const q of ['ac-1', 'AC-1', 'titre', 'DESCRIPTION']) {
      const res = await app.inject({ method: 'GET', url: `/api/search?q=${encodeURIComponent(q)}`, headers: readHeaders });
      expect(res.statusCode).toBe(200);
      const rows = res.json() as Array<{ control_id: string; code: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.code).toBe('AC-1');
    }
    const none = await app.inject({ method: 'GET', url: '/api/search?q=zzz', headers: readHeaders });
    expect((none.json() as unknown[])).toHaveLength(0);
  });

  it('escapes LIKE wildcards but matches literal percent', async () => {
    const { app } = await makeApp();
    const { planId } = await setup(app, 'PLAIN');
    await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: headers(),
      payload: { ...metadata, code: 'PCT', title: '100% couvert', schedule: { kind: 'explicit', dates: DATES } },
    });

    const wildcard = await app.inject({ method: 'GET', url: '/api/search?q=%25', headers: readHeaders });
    const rows = wildcard.json() as Array<{ code: string }>;
    expect(rows.map((r) => r.code)).toEqual(['PCT']);

    const underscore = await app.inject({ method: 'GET', url: '/api/search?q=_', headers: readHeaders });
    expect((underscore.json() as unknown[])).toHaveLength(0);
  });

  it('rejects a missing or oversized q with 422', async () => {
    const { app } = await makeApp();
    await setup(app);
    const missing = await app.inject({ method: 'GET', url: '/api/search', headers: readHeaders });
    expect(missing.statusCode).toBe(422);
    const long = await app.inject({
      method: 'GET',
      url: `/api/search?q=${'x'.repeat(121)}`,
      headers: readHeaders,
    });
    expect(long.statusCode).toBe(422);
  });

  it('caps results at 50 and includes archived controls', async () => {
    const { app } = await makeApp();
    const { planId, controlId } = await setup(app, 'SX00');
    for (let i = 1; i <= 55; i += 1) {
      await app.inject({
        method: 'POST',
        url: `/api/plans/${planId}/controls`,
        headers: headers(),
        payload: { ...metadata, code: `SX${String(i).padStart(2, '0')}`, schedule: { kind: 'explicit', dates: DATES } },
      });
    }
    await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/archive`,
      headers: headers(),
      payload: { effective_date: '2028-01-01' },
    });
    const res = await app.inject({ method: 'GET', url: '/api/search?q=SX', headers: readHeaders });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{ code: string; status: string; plan_year: number }>;
    expect(rows).toHaveLength(50);
    const archived = rows.find((r) => r.code === 'SX00');
    expect(archived?.status).toBe('archived');
    expect(rows[0]?.plan_year).toBe(2028);
  });
});

describe('clauses', () => {
  it('creates, lists and filters clauses by referential', async () => {
    const { app } = await makeApp();
    await setup(app);
    const empty = await app.inject({ method: 'GET', url: '/api/clauses', headers: readHeaders });
    expect(empty.json()).toEqual([]);

    const generic = await createClause(app, 'G.1');
    expect(generic.referential).toBeNull();
    await createClause(app, 'A.1.1', 'iso_27001');
    await createClause(app, 'A.2.1', 'iso_27001');

    const all = await app.inject({ method: 'GET', url: '/api/clauses', headers: readHeaders });
    const clauses = all.json() as Array<{ code: string; referential: string | null }>;
    expect(clauses.map((c) => c.code)).toEqual(['G.1', 'A.1.1', 'A.2.1']);

    const iso = await app.inject({
      method: 'GET',
      url: '/api/clauses?referential=iso_27001',
      headers: readHeaders,
    });
    expect((iso.json() as Array<{ code: string }>).map((c) => c.code)).toEqual(['A.1.1', 'A.2.1']);

    const unknown = await app.inject({
      method: 'GET',
      url: '/api/clauses?referential=inexistant',
      headers: readHeaders,
    });
    expect(unknown.json()).toEqual([]);
  });

  it('rejects invalid clause payloads with 422', async () => {
    const { app } = await makeApp();
    await setup(app);
    for (const payload of [
      {},
      { code: '', title: 'x' },
      { code: 'A'.repeat(81), title: 'x' },
      { code: 'A', title: '' },
      { code: 'A', title: 't', extra: 1 },
    ]) {
      const res = await app.inject({ method: 'POST', url: '/api/clauses', headers: headers(), payload });
      expect(res.statusCode).toBe(422);
    }
  });

  it('maps clauses to a control, exposes them on the control and replaces the mapping', async () => {
    const { app } = await makeApp();
    const { planId, controlId } = await setup(app);
    const first = await createClause(app, 'A.1.1', 'iso_27001');
    const second = await createClause(app, 'A.2.1', 'iso_27001');

    const put = await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/controls/${controlId}/clauses`,
      headers: headers(),
      payload: { clause_ids: [first.id, second.id] },
    });
    expect(put.statusCode).toBe(200);
    expect((put.json() as { clause_ids: string[] }).clause_ids).toEqual([first.id, second.id]);

    const control = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/controls/${controlId}`,
      headers: readHeaders,
    });
    expect((control.json() as { clauses: string[] }).clauses).toEqual(['A.1.1', 'A.2.1']);

    await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/controls/${controlId}/clauses`,
      headers: headers(),
      payload: { clause_ids: [second.id] },
    });
    const after = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/controls/${controlId}`,
      headers: readHeaders,
    });
    expect((after.json() as { clauses: string[] }).clauses).toEqual(['A.2.1']);
  });

  it('refuses unknown clause ids, bad uuids, oversized lists and foreign controls', async () => {
    const { app } = await makeApp();
    const { planId, controlId } = await setup(app);
    const url = `/api/plans/${planId}/controls/${controlId}/clauses`;

    const unknown = await app.inject({
      method: 'PUT',
      url,
      headers: headers(),
      payload: { clause_ids: [randomUUID()] },
    });
    expect(unknown.statusCode).toBe(422);

    const badUuid = await app.inject({
      method: 'PUT',
      url,
      headers: headers(),
      payload: { clause_ids: ['nope'] },
    });
    expect(badUuid.statusCode).toBe(422);

    const tooMany = await app.inject({
      method: 'PUT',
      url,
      headers: headers(),
      payload: { clause_ids: Array.from({ length: 201 }, () => randomUUID()) },
    });
    expect(tooMany.statusCode).toBe(422);

    const otherPlan = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: headers(),
      payload: { year: 2029, name: 'Plan annuel 2029', perimeter: '' },
    });
    const otherPlanId = (otherPlan.json() as { id: string }).id;
    const foreign = await app.inject({
      method: 'PUT',
      url: `/api/plans/${otherPlanId}/controls/${controlId}/clauses`,
      headers: headers(),
      payload: { clause_ids: [] },
    });
    expect(foreign.statusCode).toBe(404);
  });
});

describe('evidence', () => {
  it('uploads, lists, downloads and deletes a file', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setup(app);
    const id = occurrenceId(runtime.db.db, controlId, '2028-01-31');
    const content = Buffer.from('%PDF-1.4 fake smoke\n');
    const evidenceDir = join(runtime.dataDir, 'evidence');

    const upload = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/occurrences/${id}/evidence`,
      ...multipartFile(content, 'rapport.pdf', 'application/pdf'),
    });
    expect(upload.statusCode).toBe(201);
    const dto = upload.json() as {
      id: string;
      occurrence_id: string;
      original_name: string;
      mime_type: string;
      size_bytes: number;
      sha256: string;
    };
    expect(dto.occurrence_id).toBe(id);
    expect(dto.original_name).toBe('rapport.pdf');
    expect(dto.mime_type).toBe('application/pdf');
    expect(dto.size_bytes).toBe(content.byteLength);
    expect(dto.sha256).toBe(createHash('sha256').update(content).digest('hex'));
    expect(readdirSync(evidenceDir)).toHaveLength(1);

    const list = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/occurrences/${id}/evidence`,
      headers: readHeaders,
    });
    expect((list.json() as Array<{ id: string }>).map((e) => e.id)).toEqual([dto.id]);

    const download = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/occurrences/${id}/evidence/${dto.id}/download`,
      headers: readHeaders,
    });
    expect(download.statusCode).toBe(200);
    expect(download.body).toBe(content.toString('utf8'));
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.headers['content-disposition']).toContain('rapport.pdf');

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/plans/${planId}/occurrences/${id}/evidence/${dto.id}`,
      headers: { host: HOST, origin: ORIGIN, 'x-centurion-request': '1' },
    });
    expect(del.statusCode).toBe(204);
    const after = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/occurrences/${id}/evidence`,
      headers: readHeaders,
    });
    expect(after.json()).toEqual([]);
    expect(readdirSync(evidenceDir)).toHaveLength(0);
  });

  it('sanitizes the original filename', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setup(app);
    const id = occurrenceId(runtime.db.db, controlId, '2028-01-31');

    const upload = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/occurrences/${id}/evidence`,
      ...multipartFile(Buffer.from('x'), '../../etc/passwd', 'text/plain'),
    });
    expect(upload.statusCode).toBe(201);
    expect((upload.json() as { original_name: string }).original_name).toBe('passwd');

    const weird = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/occurrences/${id}/evidence`,
      ...multipartFile(Buffer.from('y'), 'ev il?.pdf', 'application/pdf'),
    });
    expect(weird.statusCode).toBe(201);
    const dto = weird.json() as { id: string; original_name: string };
    expect(dto.original_name).toBe('ev il_.pdf');
    const download = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/occurrences/${id}/evidence/${dto.id}/download`,
      headers: readHeaders,
    });
    expect(download.headers['content-disposition']).toContain('ev il_.pdf');
  });

  it('rejects missing file, bad type, empty and oversized uploads', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setup(app);
    const id = occurrenceId(runtime.db.db, controlId, '2028-01-31');
    const url = `/api/plans/${planId}/occurrences/${id}/evidence`;

    const noFile = await app.inject({ method: 'POST', url, ...multipartFile(Buffer.alloc(0), '', 'application/pdf', false) });
    expect(noFile.statusCode).toBe(422);

    const badType = await app.inject({
      method: 'POST',
      url,
      ...multipartFile(Buffer.from('MZ'), 'virus.exe', 'application/octet-stream'),
    });
    expect(badType.statusCode).toBe(415);

    const empty = await app.inject({
      method: 'POST',
      url,
      ...multipartFile(Buffer.alloc(0), 'vide.pdf', 'application/pdf'),
    });
    expect(empty.statusCode).toBe(413);

    const oversized = await app.inject({
      method: 'POST',
      url,
      ...multipartFile(Buffer.alloc(5 * 1024 * 1024 + 1, 1), 'gros.pdf', 'application/pdf'),
    });
    expect(oversized.statusCode).toBe(413);
  });

  it('scopes evidence to its plan and occurrence', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setup(app);
    const id = occurrenceId(runtime.db.db, controlId, '2028-01-31');
    const otherPlan = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: headers(),
      payload: { year: 2029, name: 'Plan annuel 2029', perimeter: '' },
    });
    const otherPlanId = (otherPlan.json() as { id: string }).id;

    const unknownPlan = await app.inject({
      method: 'GET',
      url: `/api/plans/${randomUUID()}/occurrences/${id}/evidence`,
      headers: readHeaders,
    });
    expect(unknownPlan.statusCode).toBe(404);

    const wrongPlan = await app.inject({
      method: 'GET',
      url: `/api/plans/${otherPlanId}/occurrences/${id}/evidence`,
      headers: readHeaders,
    });
    expect(wrongPlan.statusCode).toBe(404);

    const uploadWrongPlan = await app.inject({
      method: 'POST',
      url: `/api/plans/${otherPlanId}/occurrences/${id}/evidence`,
      ...multipartFile(Buffer.from('x'), 'a.pdf', 'application/pdf'),
    });
    expect(uploadWrongPlan.statusCode).toBe(404);

    const badEvidence = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/occurrences/${id}/evidence/${randomUUID()}/download`,
      headers: readHeaders,
    });
    expect(badEvidence.statusCode).toBe(404);
  });
});
