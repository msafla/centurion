import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app';
import { listManifests } from '../../src/server/backups/catalog';
import { fixedClock } from '../../src/server/clock';
import { loadConfig } from '../../src/server/config';
import { openDatabase, withPlanMutation } from '../../src/server/db/database';
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

async function makeApp(): Promise<{ app: FastifyInstance; runtime: Runtime; dataDir: string }> {
  const raw = mkdtempSync(join(tmpdir(), 'centurion-sched-'));
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
  return { app, runtime, dataDir };
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

async function setupControl(
  app: FastifyInstance,
  dates: string[],
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
    payload: { ...metadata, code: 'C1', schedule: { kind: 'explicit', dates } },
  });
  expect(control.statusCode).toBe(201);
  const controlId = (control.json() as { control: { id: string } }).control.id;
  return { planId, controlId };
}

function occurrenceId(db: BetterSqlite3.Database, controlId: string, date: string): string {
  return (db.prepare('SELECT id FROM occurrences WHERE control_id = ? AND occurrence_date = ?').get(
    controlId,
    date,
  ) as { id: string }).id;
}

describe('schedule preview and apply', () => {
  it('applies the delta, preserves ids and never overwrites a realization', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setupControl(app, [
      '2028-01-31',
      '2028-04-30',
      '2028-06-30',
      '2028-07-31',
      '2028-08-31',
      '2028-10-31',
    ]);
    const db = runtime.db.db;
    db.prepare("UPDATE occurrences SET state='superseded' WHERE id = ?").run(
      occurrenceId(db, controlId, '2028-06-30'),
    );
    const completedId = occurrenceId(db, controlId, '2028-10-31');
    db.prepare(
      `INSERT INTO realizations (id, occurrence_id, completed_date, fait, conformite, comment, evidence_ref, created_at, updated_at)
       VALUES (?, ?, '2028-10-31', 1, 'conforme', '', NULL, ?, ?)`,
    ).run(randomUUID(), completedId, CLOCK, CLOCK);

    const idsBefore = new Map(
      (db.prepare('SELECT id, occurrence_date FROM occurrences WHERE control_id = ?').all(controlId) as {
        id: string;
        occurrence_date: string;
      }[]).map((row) => [row.occurrence_date, row.id]),
    );
    const revisionBefore = (
      db.prepare('SELECT data_revision FROM plans WHERE id = ?').get(planId) as {
        data_revision: number;
      }
    ).data_revision;

    const preview = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-preview`,
      headers: headers(),
      payload: {
        schedule: { kind: 'explicit', dates: ['2028-07-31', '2028-09-30'] },
        active_from: null,
        active_to: null,
        effective_date: '2028-07-01',
      },
    });
    expect(preview.statusCode).toBe(201);
    const previewBody = preview.json() as {
      preview_id: string;
      counts: { keep: number; supersede: number; create: number };
    };
    expect(previewBody.counts).toEqual({ keep: 4, supersede: 1, create: 1 });

    const applied = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-apply`,
      headers: headers(),
      payload: { preview_id: previewBody.preview_id },
    });
    expect(applied.statusCode).toBe(200);
    expect((applied.json() as { delta_counts: unknown }).delta_counts).toEqual({
      keep: 4,
      supersede: 1,
      create: 1,
    });

    const state = (date: string): string =>
      (db.prepare('SELECT state FROM occurrences WHERE id = ?').get(idsBefore.get(date)) as {
        state: string;
      }).state;

    expect(state('2028-08-31')).toBe('superseded');
    expect(state('2028-06-30')).toBe('superseded');
    expect(state('2028-10-31')).toBe('completed');
    expect(state('2028-01-31')).toBe('open');
    expect(state('2028-07-31')).toBe('open');

    const realization = db
      .prepare('SELECT COUNT(*) AS n FROM realizations WHERE occurrence_id = ?')
      .get(completedId) as { n: number };
    expect(realization.n).toBe(1);

    const created = db
      .prepare('SELECT state FROM occurrences WHERE control_id = ? AND occurrence_date = ?')
      .get(controlId, '2028-09-30') as { state: string };
    expect(created.state).toBe('open');

    const revision = db.prepare('SELECT data_revision FROM plans WHERE id = ?').get(planId) as {
      data_revision: number;
    };
    expect(revision.data_revision).toBe(revisionBefore + 1);
    const audit = db
      .prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'schedule_change'")
      .get() as { n: number };
    expect(audit.n).toBe(1);

    const replay = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-apply`,
      headers: headers(),
      payload: { preview_id: previewBody.preview_id },
    });
    expect(replay.statusCode).toBe(409);
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'schedule_change'").get() as {
        n: number;
      }).n,
    ).toBe(1);
  });

  it('refuses apply when a realization changed the plan after the preview', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setupControl(app, ['2028-07-31', '2028-08-31']);
    const db = runtime.db.db;

    const preview = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-preview`,
      headers: headers(),
      payload: {
        schedule: { kind: 'explicit', dates: ['2028-07-31'] },
        active_from: null,
        active_to: null,
        effective_date: '2028-07-01',
      },
    });
    const previewId = (preview.json() as { preview_id: string }).preview_id;

    const occurrence = occurrenceId(db, controlId, '2028-08-31');
    withPlanMutation({ db: runtime.db, clock: runtime.clock }, planId, 'api', (tx) => {
      tx.db
        .prepare(
          `INSERT INTO realizations (id, occurrence_id, completed_date, fait, conformite, comment, evidence_ref, created_at, updated_at)
           VALUES (?, ?, '2028-08-31', 1, 'conforme', '', NULL, ?, ?)`,
        )
        .run(randomUUID(), occurrence, tx.nowUtc, tx.nowUtc);
      tx.markChanged();
    });

    const apply = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-apply`,
      headers: headers(),
      payload: { preview_id: previewId },
    });
    expect(apply.statusCode).toBe(409);
    const state = db.prepare('SELECT state FROM occurrences WHERE id = ?').get(occurrence) as {
      state: string;
    };
    expect(state.state).toBe('completed');
  });

  it('returns 404 for a preview belonging to another control', async () => {
    const { app } = await makeApp();
    const { planId, controlId } = await setupControl(app, ['2028-07-31']);
    const other = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: headers(),
      payload: { ...metadata, code: 'C2', schedule: { kind: 'explicit', dates: ['2028-08-01'] } },
    });
    const otherId = (other.json() as { control: { id: string } }).control.id;

    const preview = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-preview`,
      headers: headers(),
      payload: {
        schedule: { kind: 'explicit', dates: ['2028-07-31'] },
        active_from: null,
        active_to: null,
        effective_date: '2028-07-01',
      },
    });
    const previewId = (preview.json() as { preview_id: string }).preview_id;

    const apply = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${otherId}/schedule-apply`,
      headers: headers(),
      payload: { preview_id: previewId },
    });
    expect(apply.statusCode).toBe(404);
  });

  it('rejects a client-injected delta field with 422', async () => {
    const { app } = await makeApp();
    const { planId, controlId } = await setupControl(app, ['2028-07-31']);
    const apply = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-apply`,
      headers: headers(),
      payload: { preview_id: randomUUID(), delta: { create: ['2028-01-01'] } },
    });
    expect(apply.statusCode).toBe(422);
  });

  it('refuses an expired preview and an epoch change', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setupControl(app, ['2028-07-31']);

    const preview = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-preview`,
      headers: headers(),
      payload: {
        schedule: { kind: 'explicit', dates: ['2028-09-30'] },
        active_from: null,
        active_to: null,
        effective_date: '2028-07-01',
      },
    });
    const previewId = (preview.json() as { preview_id: string }).preview_id;

    runtime.db.db
      .prepare('UPDATE schedule_previews SET expires_at = ? WHERE id = ?')
      .run('2000-01-01T00:00:00.000Z', previewId);
    const expired = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-apply`,
      headers: headers(),
      payload: { preview_id: previewId },
    });
    expect(expired.statusCode).toBe(409);

    runtime.db.db
      .prepare('UPDATE schedule_previews SET expires_at = ? WHERE id = ?')
      .run('2099-01-01T00:00:00.000Z', previewId);
    runtime.engineEpoch = randomUUID();
    const stale = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-apply`,
      headers: headers(),
      payload: { preview_id: previewId },
    });
    expect(stale.statusCode).toBe(409);
  });

  it('does not create a backup or revision on a no-op apply', async () => {
    const { app, runtime, dataDir } = await makeApp();
    const { planId, controlId } = await setupControl(app, ['2028-01-01']);
    const preview = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-preview`,
      headers: headers(),
      payload: {
        schedule: { kind: 'explicit', dates: ['2028-01-01'] },
        active_from: null,
        active_to: null,
        effective_date: '2028-01-01',
      },
    });
    const body = preview.json() as { preview_id: string; counts: { supersede: number; create: number } };
    expect(body.counts).toEqual({ keep: 1, supersede: 0, create: 0 });

    const revisionBefore = (
      runtime.db.db.prepare('SELECT data_revision FROM plans WHERE id = ?').get(planId) as {
        data_revision: number;
      }
    ).data_revision;

    const apply = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-apply`,
      headers: headers(),
      payload: { preview_id: body.preview_id },
    });
    expect(apply.statusCode).toBe(200);
    expect(listManifests(dataDir).some((manifest) => manifest.reason === 'pre_schedule_change')).toBe(
      false,
    );
    const revision = runtime.db.db
      .prepare('SELECT data_revision FROM plans WHERE id = ?')
      .get(planId) as { data_revision: number };
    expect(revision.data_revision).toBe(revisionBefore);
  });

  it('aborts the whole apply when the mandatory backup fails', async () => {
    const { app, runtime, dataDir } = await makeApp();
    const { planId, controlId } = await setupControl(app, ['2028-07-31', '2028-08-31']);
    const preview = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-preview`,
      headers: headers(),
      payload: {
        schedule: { kind: 'explicit', dates: ['2028-07-31'] },
        active_from: null,
        active_to: null,
        effective_date: '2028-07-01',
      },
    });
    const previewId = (preview.json() as { preview_id: string }).preview_id;

    rmSync(join(dataDir, 'backups'), { recursive: true, force: true });
    writeFileSync(join(dataDir, 'backups'), 'not a directory');

    const apply = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/schedule-apply`,
      headers: headers(),
      payload: { preview_id: previewId },
    });
    expect(apply.statusCode).toBe(500);
    const state = runtime.db.db
      .prepare('SELECT state FROM occurrences WHERE control_id = ? AND occurrence_date = ?')
      .get(controlId, '2028-08-31') as { state: string };
    expect(state.state).toBe('open');
  });
});
