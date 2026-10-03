import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
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
  const raw = mkdtempSync(join(tmpdir(), 'centurion-import-'));
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

function jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    host: HOST,
    origin: ORIGIN,
    'x-centurion-request': '1',
    'content-type': 'application/json',
    ...extra,
  };
}

function multipart(csv: string): { headers: Record<string, string>; payload: Buffer } {
  const boundary = '----centurionboundary';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="controls.csv"\r\nContent-Type: text/csv\r\n\r\n`,
    ),
    Buffer.from(csv, 'utf8'),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return {
    headers: {
      host: HOST,
      origin: ORIGIN,
      'x-centurion-request': '1',
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  };
}

const HEADER = 'code;title;description;referentiel;reference;domain;frequency_kind;anchor_date';
const MAPPING = {
  separator: ';' as const,
  columns: {
    code: 0,
    title: 1,
    description: 2,
    referentiel: 3,
    reference: 4,
    domain: 5,
    frequency_kind: 6,
    anchor_date: 7,
  },
  effective_date: '2028-07-01',
};

async function createPlan(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/plans',
    headers: jsonHeaders(),
    payload: { year: 2028, name: 'Plan annuel 2028', perimeter: '' },
  });
  return (res.json() as { id: string }).id;
}

async function upload(app: FastifyInstance, planId: string, csv: string): Promise<string> {
  const { headers, payload } = multipart(csv);
  const res = await app.inject({ method: 'POST', url: `/api/plans/${planId}/imports`, headers, payload });
  expect(res.statusCode).toBe(201);
  return (res.json() as { import_id: string }).import_id;
}

async function mapAndPreview(app: FastifyInstance, planId: string, importId: string) {
  const res = await app.inject({
    method: 'PUT',
    url: `/api/plans/${planId}/imports/${importId}/mapping`,
    headers: jsonHeaders(),
    payload: MAPPING,
  });
  return res;
}

describe('import flow', () => {
  it('uploads, previews and atomically applies a CSV definition set', async () => {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);
    const csv = `${HEADER}\nC1;Contrôle 1;Description 1;iso_27001;R1;Dom;quarterly;2028-03-31\nC2;Contrôle 2;Description 2;isae_3402_t2;R2;Dom;annual;2028-06-30\n`;
    const importId = await upload(app, planId, csv);

    const preview = await mapAndPreview(app, planId, importId);
    expect(preview.statusCode).toBe(200);
    expect((preview.json() as { counts: unknown }).counts).toEqual({
      create: 2,
      update: 0,
      unchanged: 0,
      invalid: 0,
    });

    const applied = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/imports/${importId}/apply`,
      headers: jsonHeaders(),
      payload: {},
    });
    expect(applied.statusCode).toBe(200);

    const controls = runtime.db.db.prepare('SELECT COUNT(*) AS n FROM controls').get() as { n: number };
    expect(controls.n).toBe(2);
    const occurrences = runtime.db.db
      .prepare('SELECT COUNT(*) AS n FROM occurrences')
      .get() as { n: number };
    expect(occurrences.n).toBe(5);

    const replay = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/imports/${importId}/apply`,
      headers: jsonHeaders(),
      payload: {},
    });
    expect(replay.statusCode).toBe(409);
  });

  it('returns 404 for an import of another plan', async () => {
    const { app } = await makeApp();
    const planId = await createPlan(app);
    const importId = await upload(app, planId, `${HEADER}\nC1;T;D;iso_27001;R;Dom;once;2028-01-01\n`);
    const other = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: jsonHeaders(),
      payload: { year: 2029, name: 'Plan annuel 2029', perimeter: '' },
    });
    const otherPlan = (other.json() as { id: string }).id;
    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${otherPlan}/imports/${importId}/apply`,
      headers: jsonHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('refuses apply when any row is invalid, without writing', async () => {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);
    const csv = `${HEADER}\nC1;T;D;bad_referentiel;R;Dom;once;2028-01-01\n`;
    const importId = await upload(app, planId, csv);
    const preview = await mapAndPreview(app, planId, importId);
    expect((preview.json() as { counts: { invalid: number } }).counts.invalid).toBe(1);

    const applied = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/imports/${importId}/apply`,
      headers: jsonHeaders(),
      payload: {},
    });
    expect(applied.statusCode).toBe(422);
    expect(runtime.db.db.prepare('SELECT COUNT(*) AS n FROM controls').get()).toEqual({ n: 0 });
  });

  it('applies a complete definition, erasing an absent optional field', async () => {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);
    const first = `${HEADER};owner_name\nC1;Titre;Desc;iso_27001;R;Dom;once;2028-01-01;Alice\n`;
    const firstId = await upload(app, planId, first);
    await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/imports/${firstId}/mapping`,
      headers: jsonHeaders(),
      payload: { ...MAPPING, columns: { ...MAPPING.columns, owner_name: 8 } },
    });
    await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/imports/${firstId}/apply`,
      headers: jsonHeaders(),
      payload: {},
    });
    const owner = runtime.db.db.prepare('SELECT owner_name FROM controls').get() as {
      owner_name: string;
    };
    expect(owner.owner_name).toBe('Alice');

    // Re-import without the owner_name column -> absent optional erases it.
    const secondId = await upload(app, planId, `${HEADER}\nC1;Titre;Desc;iso_27001;R;Dom;once;2028-01-01\n`);
    const preview = await mapAndPreview(app, planId, secondId);
    expect((preview.json() as { counts: { update: number } }).counts.update).toBe(1);
    await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/imports/${secondId}/apply`,
      headers: jsonHeaders(),
      payload: {},
    });
    const after = runtime.db.db.prepare('SELECT owner_name FROM controls').get() as {
      owner_name: string;
    };
    expect(after.owner_name).toBe('');
  });

  it('preserves a completed occurrence when the schedule changes', async () => {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);
    const csv = `${HEADER}\nC1;Titre;Desc;iso_27001;R;Dom;quarterly;2028-03-31\n`;
    const importId = await upload(app, planId, csv);
    await mapAndPreview(app, planId, importId);
    await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/imports/${importId}/apply`,
      headers: jsonHeaders(),
      payload: {},
    });

    const controlId = (
      runtime.db.db.prepare("SELECT id FROM controls WHERE code = 'C1'").get() as { id: string }
    ).id;
    const occurrence = (
      runtime.db.db
        .prepare("SELECT id FROM occurrences WHERE control_id = ? AND occurrence_date = '2028-09-30'")
        .get(controlId) as { id: string }
    ).id;
    runtime.db.db
      .prepare(
        `INSERT INTO realizations (id, occurrence_id, completed_date, fait, conformite, comment, evidence_ref, created_at, updated_at)
         VALUES (?, ?, '2028-09-30', 1, 'conforme', '', NULL, ?, ?)`,
      )
      .run(randomUUID(), occurrence, CLOCK, CLOCK);

    const change = `${HEADER}\nC1;Titre;Desc;iso_27001;R;Dom;explicit;2028-12-31\n`;
    const changeId = await upload(app, planId, change);
    await mapAndPreview(app, planId, changeId);
    await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/imports/${changeId}/apply`,
      headers: jsonHeaders(),
      payload: {},
    });

    const state = runtime.db.db
      .prepare('SELECT state FROM occurrences WHERE id = ?')
      .get(occurrence) as { state: string };
    expect(state.state).toBe('completed');
    const realization = runtime.db.db
      .prepare('SELECT COUNT(*) AS n FROM realizations WHERE occurrence_id = ?')
      .get(occurrence) as { n: number };
    expect(realization.n).toBe(1);
  });
});
