import Database from 'better-sqlite3';
import type { Clock } from '../clock';
import { AppError } from '../http/errors';
import { type AuditEvent, type AuditSource, insertAudit } from './audit';
import { CURRENT_SCHEMA_VERSION, migrate } from './migrate';

export type DatabaseHandle = {
  db: Database.Database;
  path: string;
  schemaVersion: number;
  close(): void;
};

export type PlanRow = {
  id: string;
  year: number;
  name: string;
  perimeter: string;
  data_revision: number;
  created_at: string;
  updated_at: string;
};

export type ControlRow = {
  id: string;
  plan_id: string;
  code: string;
  title: string;
  description: string;
  referentiel: string;
  reference: string;
  domain: string;
  owner_name: string;
  method: string;
  expected_evidence: string;
  automated: number;
  automation_github_url: string | null;
  frequency_kind: string;
  anchor_date: string | null;
  explicit_dates_json: string | null;
  active_from: string | null;
  active_to: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
};

export type OccurrenceRow = {
  id: string;
  control_id: string;
  occurrence_date: string;
  state: 'open' | 'completed' | 'superseded';
  created_at: string;
  updated_at: string;
};

export type RealizationRow = {
  id: string;
  occurrence_id: string;
  completed_date: string;
  fait: number;
  conformite: string;
  comment: string;
  evidence_ref: string | null;
  created_at: string;
  updated_at: string;
};

export function openDatabase(path: string): DatabaseHandle {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  const schemaVersion = migrate(db);
  return {
    db,
    path,
    schemaVersion,
    close: () => db.close(),
  };
}

export function assertSchemaCurrent(handle: DatabaseHandle): void {
  if (handle.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new AppError(500, 'schema_version_mismatch', 'Unexpected schema version');
  }
}

export type DomainTx = {
  db: Database.Database;
  planId: string;
  source: AuditSource;
  nowUtc: string;
  changed: boolean;
  markChanged(): void;
  audit(event: AuditEvent): void;
};

export type MutationDeps = {
  db: DatabaseHandle;
  clock: Clock;
};

/**
 * Runs a synchronous, indivisible business mutation for one plan. The plan
 * revision is incremented at most once, and only when the callback marked a
 * real change. Audit rows written through `tx.audit` share the transaction.
 */
export function withPlanMutation<T>(
  deps: MutationDeps,
  planId: string,
  source: AuditSource,
  fn: (tx: DomainTx) => T,
): T {
  const { db: handle, clock } = deps;
  const nowUtc = clock.nowUtc();
  const run = handle.db.transaction((): T => {
    const plan = handle.db.prepare('SELECT id FROM plans WHERE id = ?').get(planId);
    if (!plan) throw new AppError(404, 'not_found', 'Plan not found');

    const tx: DomainTx = {
      db: handle.db,
      planId,
      source,
      nowUtc,
      changed: false,
      markChanged() {
        tx.changed = true;
      },
      audit(event) {
        insertAudit(handle.db, event, source, nowUtc);
      },
    };

    const result = fn(tx);
    if (tx.changed) {
      handle.db
        .prepare('UPDATE plans SET data_revision = data_revision + 1, updated_at = ? WHERE id = ?')
        .run(nowUtc, planId);
    }
    return result;
  });

  return run();
}
