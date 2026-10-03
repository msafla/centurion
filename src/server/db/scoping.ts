import type BetterSqlite3 from 'better-sqlite3';
import { AppError } from '../http/errors';
import type { ControlRow, OccurrenceRow, PlanRow } from './database';

export function planInScope(db: BetterSqlite3.Database, planId: string): PlanRow {
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as PlanRow | undefined;
  if (!row) throw new AppError(404, 'not_found', 'Plan not found');
  return row;
}

export function controlInPlan(
  db: BetterSqlite3.Database,
  planId: string,
  controlId: string,
): ControlRow {
  const row = db
    .prepare('SELECT * FROM controls WHERE id = ? AND plan_id = ?')
    .get(controlId, planId) as ControlRow | undefined;
  if (!row) throw new AppError(404, 'not_found', 'Control not found');
  return row;
}

export function occurrenceInPlan(
  db: BetterSqlite3.Database,
  planId: string,
  occurrenceId: string,
): OccurrenceRow {
  const row = db
    .prepare(
      `SELECT o.* FROM occurrences o
         JOIN controls c ON c.id = o.control_id
        WHERE o.id = ? AND c.plan_id = ?`,
    )
    .get(occurrenceId, planId) as OccurrenceRow | undefined;
  if (!row) throw new AppError(404, 'not_found', 'Occurrence not found');
  return row;
}
