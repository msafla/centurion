import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/server/clock';
import { type DatabaseHandle, openDatabase, withPlanMutation } from '../../src/server/db/database';
import { bootstrapPlanIfEmpty } from '../../src/server/domain/plans';

const handles: DatabaseHandle[] = [];
const dirs: string[] = [];

function fresh(): DatabaseHandle {
  const dir = mkdtempSync(join(tmpdir(), 'centurion-db-'));
  dirs.push(dir);
  const handle = openDatabase(join(dir, 'centurion.sqlite'));
  handles.push(handle);
  return handle;
}

afterEach(() => {
  while (handles.length > 0) handles.pop()?.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

const NOW = '2028-01-01T00:00:00.000Z';

function seedPlan(db: BetterSqlite3.Database): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO plans (id, year, name, perimeter, data_revision, created_at, updated_at)
     VALUES (?, ?, ?, '', 0, ?, ?)`,
  ).run(id, 2028, 'Plan annuel 2028', NOW, NOW);
  return id;
}

function seedControl(db: BetterSqlite3.Database, planId: string, code = 'C1'): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO controls
       (id, plan_id, code, title, description, reference, domain, owner_name,
        method, expected_evidence, automated, automation_github_url, frequency_kind,
        anchor_date, explicit_dates_json, active_from, active_to, status, created_at, updated_at)
     VALUES (?, ?, ?, 'Titre', 'Description', 'REF', 'Domaine', '', '', '',
             0, NULL, 'annual', '2028-01-01', NULL, NULL, NULL, 'active', ?, ?)`,
  ).run(id, planId, code, NOW, NOW);
  return id;
}

function seedOccurrence(
  db: BetterSqlite3.Database,
  controlId: string,
  date: string,
  state: 'open' | 'completed' | 'superseded' = 'open',
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO occurrences (id, control_id, occurrence_date, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, controlId, date, state, NOW, NOW);
  return id;
}

function insertRealization(db: BetterSqlite3.Database, occurrenceId: string): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO realizations
       (id, occurrence_id, completed_date, fait, conformite, comment, evidence_ref, created_at, updated_at)
     VALUES (?, ?, '2028-04-15', 1, 'conforme', '', NULL, ?, ?)`,
  ).run(id, occurrenceId, NOW, NOW);
  return id;
}

describe('migrations and pragmas', () => {
  it('is idempotent and reports schema version 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'centurion-db-'));
    dirs.push(dir);
    const path = join(dir, 'centurion.sqlite');

    const first = openDatabase(path);
    expect(first.schemaVersion).toBe(3);
    first.close();

    const second = openDatabase(path);
    handles.push(second);
    expect(second.schemaVersion).toBe(3);
    expect(second.db.pragma('user_version', { simple: true })).toBe(3);
    const tables = second.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toContain('audit_events');
    expect(tables.map((t) => t.name)).toContain('mcp_proposals');
  });

  it('enables WAL, foreign keys and busy timeout', () => {
    const handle = fresh();
    expect(String(handle.db.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal');
    expect(handle.db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(handle.db.pragma('busy_timeout', { simple: true })).toBe(5000);
  });
});

describe('constraints', () => {
  it('allows one active date and keeps an older superseded row', () => {
    const handle = fresh();
    const plan = seedPlan(handle.db);
    const control = seedControl(handle.db, plan);

    seedOccurrence(handle.db, control, '2028-03-31', 'open');
    expect(() => seedOccurrence(handle.db, control, '2028-03-31', 'open')).toThrow();
    expect(() => seedOccurrence(handle.db, control, '2028-03-31', 'completed')).toThrow();
    expect(() => seedOccurrence(handle.db, control, '2028-03-31', 'superseded')).not.toThrow();
  });

  it('enforces a unique normalized code inside a plan', () => {
    const handle = fresh();
    const plan = seedPlan(handle.db);
    seedControl(handle.db, plan, 'C1');
    expect(() => seedControl(handle.db, plan, 'C1')).toThrow();
  });

  it('stores hostile SQL as inert data', () => {
    const handle = fresh();
    const plan = seedPlan(handle.db);
    const payload = "'; DROP TABLE controls;--";
    const id = randomUUID();
    handle.db
      .prepare(
        `INSERT INTO controls
           (id, plan_id, code, title, description, reference, domain, owner_name,
            method, expected_evidence, automated, automation_github_url, frequency_kind,
            anchor_date, explicit_dates_json, active_from, active_to, status, created_at, updated_at)
         VALUES (?, ?, 'C2', ?, 'D', 'R', 'Dom', '', '', '', 0, NULL, 'annual',
                 '2028-01-01', NULL, NULL, NULL, 'active', ?, ?)`,
      )
      .run(id, plan, payload, NOW, NOW);
    const stored = handle.db.prepare('SELECT title FROM controls WHERE id = ?').get(id) as {
      title: string;
    };
    expect(stored.title).toBe(payload);
    expect(handle.db.prepare('SELECT count(*) AS c FROM controls').get()).toEqual({ c: 1 });
  });
});

describe('realization and occurrence invariants', () => {
  it('marks the occurrence completed on realization insert', () => {
    const handle = fresh();
    const plan = seedPlan(handle.db);
    const control = seedControl(handle.db, plan);
    const occurrence = seedOccurrence(handle.db, control, '2028-03-31');
    insertRealization(handle.db, occurrence);
    const state = handle.db.prepare('SELECT state FROM occurrences WHERE id = ?').get(occurrence) as {
      state: string;
    };
    expect(state.state).toBe('completed');
  });

  it('refuses a realization on a superseded occurrence', () => {
    const handle = fresh();
    const plan = seedPlan(handle.db);
    const control = seedControl(handle.db, plan);
    const occurrence = seedOccurrence(handle.db, control, '2028-03-31', 'superseded');
    expect(() => insertRealization(handle.db, occurrence)).toThrow();
  });

  it('refuses leaving completed with a realization and direct completion without one', () => {
    const handle = fresh();
    const plan = seedPlan(handle.db);
    const control = seedControl(handle.db, plan);
    const completed = seedOccurrence(handle.db, control, '2028-03-31');
    insertRealization(handle.db, completed);
    expect(() =>
      handle.db.prepare("UPDATE occurrences SET state='open' WHERE id = ?").run(completed),
    ).toThrow();

    const open = seedOccurrence(handle.db, control, '2028-06-30');
    expect(() =>
      handle.db.prepare("UPDATE occurrences SET state='completed' WHERE id = ?").run(open),
    ).toThrow();
  });

  it('forbids deleting a realization', () => {
    const handle = fresh();
    const plan = seedPlan(handle.db);
    const control = seedControl(handle.db, plan);
    const occurrence = seedOccurrence(handle.db, control, '2028-03-31');
    insertRealization(handle.db, occurrence);
    expect(() => handle.db.prepare('DELETE FROM realizations').run()).toThrow();
  });
});

describe('append-only audit', () => {
  it('refuses UPDATE and DELETE on audit events', () => {
    const handle = fresh();
    const plan = seedPlan(handle.db);
    handle.db
      .prepare(
        `INSERT INTO audit_events (id, entity_type, entity_id, plan_id, control_id, action, at_utc, before_json, after_json, source, created_at)
         VALUES (?, 'plan', ?, ?, NULL, 'create', ?, NULL, NULL, 'system', ?)`,
      )
      .run(randomUUID(), plan, plan, NOW, NOW);
    expect(() => handle.db.prepare("UPDATE audit_events SET action='x'").run()).toThrow();
    expect(() => handle.db.prepare('DELETE FROM audit_events').run()).toThrow();
  });
});

describe('withPlanMutation', () => {
  it('rolls back mutation and audit together', () => {
    const handle = fresh();
    const plan = seedPlan(handle.db);
    const clock = fixedClock('2028-04-15T10:00:00.000Z');

    expect(() =>
      withPlanMutation({ db: handle, clock }, plan, 'api', (tx) => {
        seedControl(tx.db, plan, 'C3');
        tx.audit({
          entity_type: 'control',
          entity_id: 'x',
          plan_id: plan,
          control_id: null,
          action: 'create',
        });
        tx.markChanged();
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(handle.db.prepare('SELECT count(*) AS c FROM controls').get()).toEqual({ c: 0 });
    expect(handle.db.prepare('SELECT count(*) AS c FROM audit_events').get()).toEqual({ c: 0 });
    const revision = handle.db
      .prepare('SELECT data_revision FROM plans WHERE id = ?')
      .get(plan) as { data_revision: number };
    expect(revision.data_revision).toBe(0);
  });

  it('increments the revision once and not on a no-op', () => {
    const handle = fresh();
    const plan = seedPlan(handle.db);
    const clock = fixedClock('2028-04-15T10:00:00.000Z');

    withPlanMutation({ db: handle, clock }, plan, 'api', (tx) => {
      tx.markChanged();
    });
    withPlanMutation({ db: handle, clock }, plan, 'api', () => undefined);

    const revision = handle.db
      .prepare('SELECT data_revision FROM plans WHERE id = ?')
      .get(plan) as { data_revision: number };
    expect(revision.data_revision).toBe(1);
  });

  it('returns 404 for an unknown plan', () => {
    const handle = fresh();
    const clock = fixedClock('2028-04-15T10:00:00.000Z');
    expect(() =>
      withPlanMutation({ db: handle, clock }, randomUUID(), 'api', () => undefined),
    ).toThrow(/Plan not found/);
  });
});

describe('bootstrap', () => {
  it('creates the current Paris year and never a second plan', () => {
    const handle = fresh();
    // 22:30 UTC on Dec 31 is 23:30 Paris -> still 2027.
    bootstrapPlanIfEmpty(handle, fixedClock('2027-12-31T22:30:00.000Z'));
    const first = handle.db.prepare('SELECT year, name FROM plans').all() as {
      year: number;
      name: string;
    }[];
    expect(first).toEqual([{ year: 2027, name: 'Plan annuel 2027' }]);

    // 23:30 UTC on Dec 31 is 00:30 Paris on Jan 1 -> 2028.
    const handle2 = fresh();
    bootstrapPlanIfEmpty(handle2, fixedClock('2027-12-31T23:30:00.000Z'));
    const second = handle2.db.prepare('SELECT year FROM plans').all() as { year: number }[];
    expect(second).toEqual([{ year: 2028 }]);

    bootstrapPlanIfEmpty(handle2, fixedClock('2029-06-01T00:00:00.000Z'));
    const count = handle2.db.prepare('SELECT count(*) AS c FROM plans').get() as { c: number };
    expect(count.c).toBe(1);
  });
});
