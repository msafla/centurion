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
  const raw = mkdtempSync(join(tmpdir(), 'centurion-status-'));
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

async function setup(
  app: FastifyInstance,
  dates: string[] = ['2028-01-31', '2028-03-31', '2028-06-30', '2028-09-30'],
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

function stateOf(db: BetterSqlite3.Database, id: string): string {
  return (db.prepare('SELECT state FROM occurrences WHERE id = ?').get(id) as { state: string })
    .state;
}

describe('metadata patch protection', () => {
  it('refuses code, planning, status and id in PATCH', async () => {
    const { app } = await makeApp();
    const { planId, controlId } = await setup(app);
    for (const payload of [
      { code: 'X' },
      { schedule: { kind: 'annual', anchorDate: '2028-01-01' } },
      { status: 'archived' },
      { id: randomUUID() },
    ]) {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/plans/${planId}/controls/${controlId}`,
        headers: headers(),
        payload,
      });
      expect(res.statusCode).toBe(422);
    }
  });

  it('refuses metadata edit on an archived control', async () => {
    const { app } = await makeApp();
    const { planId, controlId } = await setup(app);
    await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/archive`,
      headers: headers(),
      payload: { effective_date: '2028-03-31' },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${planId}/controls/${controlId}`,
      headers: headers(),
      payload: { title: 'Nouveau titre' },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('archival', () => {
  it('keeps completed and earlier open, supersedes open from the effect', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setup(app);
    const db = runtime.db.db;
    await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/occurrences/${occurrenceId(db, controlId, '2028-09-30')}/status`,
      headers: headers(),
      payload: {
        fait: true,
        conformite: 'conforme',
        completed_date: '2028-01-01',
        comment: '',
        evidence_ref: null,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/archive`,
      headers: headers(),
      payload: { effective_date: '2028-03-31' },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { occurrences_superseded: number }).occurrences_superseded).toBe(2);

    expect(stateOf(db, occurrenceId(db, controlId, '2028-01-31'))).toBe('open');
    expect(stateOf(db, occurrenceId(db, controlId, '2028-03-31'))).toBe('superseded');
    expect(stateOf(db, occurrenceId(db, controlId, '2028-06-30'))).toBe('superseded');
    expect(stateOf(db, occurrenceId(db, controlId, '2028-09-30'))).toBe('completed');
    const status = db.prepare('SELECT status FROM controls WHERE id = ?').get(controlId) as {
      status: string;
    };
    expect(status.status).toBe('archived');
  });

  it('allows filling a kept open occurrence but refuses a superseded one', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setup(app);
    const db = runtime.db.db;
    await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/archive`,
      headers: headers(),
      payload: { effective_date: '2028-03-31' },
    });

    const kept = await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/occurrences/${occurrenceId(db, controlId, '2028-01-31')}/status`,
      headers: headers(),
      payload: {
        fait: true,
        conformite: 'conforme',
        completed_date: '2028-02-01',
        comment: 'tardif',
        evidence_ref: null,
      },
    });
    expect(kept.statusCode).toBe(200);

    const superseded = await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/occurrences/${occurrenceId(db, controlId, '2028-06-30')}/status`,
      headers: headers(),
      payload: {
        fait: true,
        conformite: 'conforme',
        completed_date: '2028-04-01',
        comment: '',
        evidence_ref: null,
      },
    });
    expect(superseded.statusCode).toBe(409);
  });

  it('re-archiving returns 409', async () => {
    const { app } = await makeApp();
    const { planId, controlId } = await setup(app);
    await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/archive`,
      headers: headers(),
      payload: { effective_date: '2028-03-31' },
    });
    const again = await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls/${controlId}/archive`,
      headers: headers(),
      payload: { effective_date: '2028-03-31' },
    });
    expect(again.statusCode).toBe(409);
  });
});

describe('realizations', () => {
  it('forces non_applicable and null evidence when fait is false', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setup(app);
    const id = occurrenceId(runtime.db.db, controlId, '2028-01-31');
    const res = await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/occurrences/${id}/status`,
      headers: headers(),
      payload: {
        fait: false,
        conformite: 'conforme',
        completed_date: '2028-04-15',
        comment: 'constat',
        evidence_ref: 'ref',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { state: string; realization: { conformite: string; evidence_ref: null } };
    expect(body.state).toBe('completed');
    expect(body.realization.conformite).toBe('non_applicable');
    expect(body.realization.evidence_ref).toBeNull();
  });

  it('accepts the four conformities when fait is true', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setup(app);
    const db = runtime.db.db;
    for (const [index, conformite] of [
      'conforme',
      'partiellement_conforme',
      'non_conforme',
      'non_applicable',
    ].entries()) {
      const id = occurrenceId(db, controlId, ['2028-01-31', '2028-03-31', '2028-06-30', '2028-09-30'][index] ?? '2028-01-31');
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
  });

  it('allows a late date outside the plan year but refuses a future date', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setup(app);
    const db = runtime.db.db;
    const late = await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/occurrences/${occurrenceId(db, controlId, '2028-01-31')}/status`,
      headers: headers(),
      payload: {
        fait: true,
        conformite: 'conforme',
        completed_date: '2027-12-01',
        comment: '',
        evidence_ref: null,
      },
    });
    expect(late.statusCode).toBe(200);

    const future = await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/occurrences/${occurrenceId(db, controlId, '2028-03-31')}/status`,
      headers: headers(),
      payload: {
        fait: true,
        conformite: 'conforme',
        completed_date: '2028-04-16',
        comment: '',
        evidence_ref: null,
      },
    });
    expect(future.statusCode).toBe(422);
  });

  it('keeps the UUID on correction and audits before/after; no-op writes nothing', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setup(app);
    const db = runtime.db.db;
    const id = occurrenceId(db, controlId, '2028-01-31');
    const payload = {
      fait: true,
      conformite: 'conforme' as const,
      completed_date: '2028-04-15',
      comment: 'premier',
      evidence_ref: null,
    };
    const first = await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/occurrences/${id}/status`,
      headers: headers(),
      payload,
    });
    const realizationId = (first.json() as { realization: { id: string } }).realization.id;

    const corrected = await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/occurrences/${id}/status`,
      headers: headers(),
      payload: { ...payload, comment: 'corrigé' },
    });
    expect((corrected.json() as { realization: { id: string } }).realization.id).toBe(realizationId);

    const revisionBefore = (
      db.prepare('SELECT data_revision FROM plans WHERE id = ?').get(planId) as {
        data_revision: number;
      }
    ).data_revision;
    const auditBefore = (
      db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_type = 'realization'").get() as {
        n: number;
      }
    ).n;

    const noop = await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/occurrences/${id}/status`,
      headers: headers(),
      payload: { ...payload, comment: 'corrigé' },
    });
    expect(noop.statusCode).toBe(200);
    expect(
      (db.prepare('SELECT data_revision FROM plans WHERE id = ?').get(planId) as {
        data_revision: number;
      }).data_revision,
    ).toBe(revisionBefore);
    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_type = 'realization'").get() as {
        n: number;
      }).n,
    ).toBe(auditBefore);

    const history = await app.inject({
      method: 'GET',
      url: `/api/plans/${planId}/controls/${controlId}/audit-events`,
      headers: { host: HOST },
    });
    expect(history.statusCode).toBe(200);
    const actions = (history.json() as { items: { action: string; before: unknown; after: unknown }[] }).items;
    expect(actions.some((event) => event.action === 'correct')).toBe(true);
    const correctEvent = actions.find((event) => event.action === 'correct');
    expect(correctEvent?.before).not.toBeNull();
    expect(correctEvent?.after).not.toBeNull();
  });

  it('persists a realization across a close/reopen', async () => {
    const { app, runtime } = await makeApp();
    const { planId, controlId } = await setup(app);
    const id = occurrenceId(runtime.db.db, controlId, '2028-01-31');
    await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/occurrences/${id}/status`,
      headers: headers(),
      payload: {
        fait: true,
        conformite: 'conforme',
        completed_date: '2028-04-15',
        comment: 'persistant',
        evidence_ref: null,
      },
    });

    const path = runtime.db.path;
    runtime.db.close();
    runtime.db = openDatabase(path);

    const row = runtime.db.db
      .prepare(
        `SELECT r.comment, o.state FROM realizations r
           JOIN occurrences o ON o.id = r.occurrence_id
          WHERE r.occurrence_id = ?`,
      )
      .get(id) as { comment: string; state: string };
    expect(row).toEqual({ comment: 'persistant', state: 'completed' });
  });

  it('refuses history for a control in another plan', async () => {
    const { app } = await makeApp();
    const { controlId } = await setup(app);
    const otherPlan = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: headers(),
      payload: { year: 2029, name: 'Plan annuel 2029', perimeter: '' },
    });
    const otherPlanId = (otherPlan.json() as { id: string }).id;
    const res = await app.inject({
      method: 'GET',
      url: `/api/plans/${otherPlanId}/controls/${controlId}/audit-events`,
      headers: { host: HOST },
    });
    expect(res.statusCode).toBe(404);
  });
});
