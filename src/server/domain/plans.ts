import { randomUUID } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
import type { ControlDto, Page, PlanDto } from '../../shared/schemas';
import { MAX_OCCURRENCES_PER_PLAN } from '../../shared/limits';
import { type AuditSource, insertAudit } from '../db/audit';
import {
  type ControlRow,
  type MutationDeps,
  type PlanRow,
  withPlanMutation,
} from '../db/database';
import { AppError } from '../http/errors';
import {
  insertControl,
  insertOccurrences,
  metadataOf,
  rowToSchedule,
  toControlDto,
} from './controls';
import { copyControlReferentials } from './referentials';
import { generateDates, translateDefinitionDates } from './schedule';

/**
 * Creates the current-year plan only when the database has no plan at all.
 * An existing older plan is never silently followed by a new year.
 */
export function bootstrapPlanIfEmpty(
  handle: { db: BetterSqlite3.Database },
  clock: { todayParis(): string; nowUtc(): string },
): string | null {
  const count = handle.db.prepare('SELECT COUNT(*) AS c FROM plans').get() as { c: number };
  if (count.c > 0) return null;

  const year = Number(clock.todayParis().slice(0, 4));
  const now = clock.nowUtc();
  const id = randomUUID();
  handle.db
    .prepare(
      `INSERT INTO plans (id, year, name, perimeter, data_revision, created_at, updated_at)
       VALUES (?, ?, ?, '', 0, ?, ?)`,
    )
    .run(id, year, `Plan annuel ${year}`, now, now);
  return id;
}

export function toPlanDto(row: PlanRow): PlanDto {
  return {
    id: row.id,
    year: row.year,
    name: row.name,
    perimeter: row.perimeter,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function listPlans(
  db: BetterSqlite3.Database,
  page: number,
  pageSize: number,
): Page<PlanDto> {
  const total = (db.prepare('SELECT COUNT(*) AS n FROM plans').get() as { n: number }).n;
  const rows = db
    .prepare('SELECT * FROM plans ORDER BY year DESC, id LIMIT ? OFFSET ?')
    .all(pageSize, (page - 1) * pageSize) as PlanRow[];
  return { items: rows.map(toPlanDto), page, page_size: pageSize, total };
}

export function createPlan(
  deps: MutationDeps,
  input: { year: number; name: string; perimeter: string },
  source: AuditSource,
): PlanDto {
  const run = deps.db.db.transaction(() => {
    if (deps.db.db.prepare('SELECT 1 FROM plans WHERE year = ?').get(input.year)) {
      throw new AppError(409, 'year_exists', 'A plan already exists for this year');
    }
    const id = randomUUID();
    const now = deps.clock.nowUtc();
    deps.db.db
      .prepare(
        `INSERT INTO plans (id, year, name, perimeter, data_revision, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(id, input.year, input.name, input.perimeter, now, now);
    const row = deps.db.db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as PlanRow;
    insertAudit(
      deps.db.db,
      {
        entity_type: 'plan',
        entity_id: id,
        plan_id: id,
        control_id: null,
        action: 'create',
        after: toPlanDto(row),
      },
      source,
      now,
    );
    return toPlanDto(row);
  });
  return run();
}

export function updatePlan(
  deps: MutationDeps,
  planId: string,
  patch: { name?: string; perimeter?: string },
  source: AuditSource,
): PlanDto {
  return withPlanMutation(deps, planId, source, (tx) => {
    const row = tx.db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as PlanRow;
    const name = patch.name ?? row.name;
    const perimeter = patch.perimeter ?? row.perimeter;
    if (name === row.name && perimeter === row.perimeter) return toPlanDto(row);

    tx.db
      .prepare('UPDATE plans SET name = ?, perimeter = ?, updated_at = ? WHERE id = ?')
      .run(name, perimeter, tx.nowUtc, planId);
    const updated = tx.db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as PlanRow;
    tx.audit({
      entity_type: 'plan',
      entity_id: planId,
      plan_id: planId,
      control_id: null,
      action: 'update',
      before: toPlanDto(row),
      after: toPlanDto(updated),
    });
    tx.markChanged();
    return toPlanDto(updated);
  });
}

export function cloneYear(
  deps: MutationDeps,
  sourcePlanId: string,
  source: AuditSource,
): { plan: PlanDto; controls_created: number; occurrences_created: number } {
  const run = deps.db.db.transaction(() => {
    const sourcePlan = deps.db.db
      .prepare('SELECT * FROM plans WHERE id = ?')
      .get(sourcePlanId) as PlanRow | undefined;
    if (!sourcePlan) throw new AppError(404, 'not_found', 'Plan not found');

    const targetYear = sourcePlan.year + 1;
    if (targetYear > 2100) {
      throw new AppError(422, 'year_out_of_range', 'Target year is out of range');
    }
    if (deps.db.db.prepare('SELECT 1 FROM plans WHERE year = ?').get(targetYear)) {
      throw new AppError(409, 'year_exists', 'Target year already exists');
    }

    const now = deps.clock.nowUtc();
    const newPlanId = randomUUID();
    deps.db.db
      .prepare(
        `INSERT INTO plans (id, year, name, perimeter, data_revision, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(newPlanId, targetYear, `Plan annuel ${targetYear}`, sourcePlan.perimeter, now, now);

    const controls = deps.db.db
      .prepare("SELECT * FROM controls WHERE plan_id = ? AND status = 'active' ORDER BY code, id")
      .all(sourcePlanId) as ControlRow[];

    let occurrences = 0;
    const created: ControlDto[] = [];
    for (const control of controls) {
      const translated = translateDefinitionDates(
        {
          schedule: rowToSchedule(control),
          active_from: control.active_from,
          active_to: control.active_to,
        },
        targetYear,
      );
      const dates = generateDates(targetYear, translated.schedule, {
        active_from: translated.active_from,
        active_to: translated.active_to,
      });
      if (occurrences + dates.length > MAX_OCCURRENCES_PER_PLAN) {
        throw new AppError(422, 'occurrence_cap_exceeded', 'Plan occurrence cap exceeded');
      }
      const row = insertControl(deps.db.db, {
        planId: newPlanId,
        code: control.code,
        metadata: metadataOf(deps.db.db, control),
        schedule: translated.schedule,
        active_from: translated.active_from,
        active_to: translated.active_to,
        nowUtc: now,
      });
      insertOccurrences(deps.db.db, row.id, dates, now);
      copyControlReferentials(deps.db.db, control.id, row.id, now);
      occurrences += dates.length;
      created.push(toControlDto(deps.db.db, row));
      insertAudit(
        deps.db.db,
        {
          entity_type: 'control',
          entity_id: row.id,
          plan_id: newPlanId,
          control_id: row.id,
          action: 'clone',
          after: toControlDto(deps.db.db, row),
        },
        source,
        now,
      );
    }

    const newPlan = deps.db.db
      .prepare('SELECT * FROM plans WHERE id = ?')
      .get(newPlanId) as PlanRow;
    insertAudit(
      deps.db.db,
      {
        entity_type: 'plan',
        entity_id: newPlanId,
        plan_id: newPlanId,
        control_id: null,
        action: 'clone',
        after: toPlanDto(newPlan),
      },
      source,
      now,
    );

    return {
      plan: toPlanDto(newPlan),
      controls_created: created.length,
      occurrences_created: occurrences,
    };
  });
  return run();
}
