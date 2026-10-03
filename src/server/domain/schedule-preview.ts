import { randomUUID } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
import type { CivilDate, ControlDto, OccurrenceState, Schedule } from '../../shared/schemas';
import { MAX_OCCURRENCES_PER_PLAN, PREVIEW_TTL_MS } from '../../shared/limits';
import { createBackup } from '../backups/backup';
import type { AuditSource } from '../db/audit';
import { type ControlRow, type PlanRow, withPlanMutation } from '../db/database';
import { controlInPlan } from '../db/scoping';
import { AppError } from '../http/errors';
import type { Runtime } from '../runtime';
import {
  assertDefinitionInYear,
  rowToSchedule,
  scheduleToStorage,
  toControlDto,
} from './controls';
import { type ScheduleDelta, computeScheduleDelta } from './schedule';

export type ScheduleChangeInput = {
  schedule: Schedule;
  active_from: CivilDate | null;
  active_to: CivilDate | null;
  effective_date: CivilDate;
};

export type SchedulePreviewDto = {
  preview_id: string;
  control_id: string;
  effective_date: CivilDate;
  base_plan_revision: number;
  expires_at: string;
  counts: { keep: number; supersede: number; create: number };
  sample: { keep: CivilDate[]; supersede: CivilDate[]; create: CivilDate[] };
  truncated: boolean;
};

type OccurrenceLite = { id: string; date: CivilDate; state: OccurrenceState };

type PreviewRow = {
  id: string;
  plan_id: string;
  control_id: string;
  base_plan_revision: number;
  engine_epoch: string;
  requested_schedule_json: string;
  delta_json: string;
  expires_at: string;
  consumed_at: string | null;
};

function occurrenceLites(db: BetterSqlite3.Database, controlId: string): OccurrenceLite[] {
  return db
    .prepare(
      'SELECT id, occurrence_date AS date, state FROM occurrences WHERE control_id = ? ORDER BY occurrence_date, id',
    )
    .all(controlId) as OccurrenceLite[];
}

function toPreviewDto(
  previewId: string,
  controlId: string,
  input: ScheduleChangeInput,
  basePlanRevision: number,
  expiresAt: string,
  delta: ScheduleDelta,
  occurrences: OccurrenceLite[],
): SchedulePreviewDto {
  const byId = new Map(occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const keepDates = delta.keep.map((id) => byId.get(id)?.date ?? '');
  const supersedeDates = delta.supersede.map((id) => byId.get(id)?.date ?? '');
  return {
    preview_id: previewId,
    control_id: controlId,
    effective_date: input.effective_date,
    base_plan_revision: basePlanRevision,
    expires_at: expiresAt,
    counts: { keep: delta.keep.length, supersede: delta.supersede.length, create: delta.create.length },
    sample: {
      keep: keepDates.slice(0, 100),
      supersede: supersedeDates.slice(0, 100),
      create: delta.create.slice(0, 100),
    },
    truncated:
      keepDates.length > 100 || supersedeDates.length > 100 || delta.create.length > 100,
  };
}

export function createSchedulePreview(
  runtime: Runtime,
  planId: string,
  controlId: string,
  input: ScheduleChangeInput,
  _source: AuditSource,
): SchedulePreviewDto {
  const db = runtime.db.db;
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as PlanRow | undefined;
  if (!plan) throw new AppError(404, 'not_found', 'Plan not found');
  const control = controlInPlan(db, planId, controlId);
  if (control.status === 'archived') {
    throw new AppError(409, 'control_archived', 'Archived control cannot change schedule');
  }
  assertDefinitionInYear(plan.year, input.schedule, {
    active_from: input.active_from,
    active_to: input.active_to,
  });
  if (Number(input.effective_date.slice(0, 4)) !== plan.year) {
    throw new AppError(422, 'date_out_of_year', 'Effective date must be in the plan year');
  }

  const occurrences = occurrenceLites(db, controlId);
  const delta = computeScheduleDelta({
    year: plan.year,
    occurrences,
    newSchedule: input.schedule,
    newWindow: { active_from: input.active_from, active_to: input.active_to },
    effectiveDate: input.effective_date,
  });

  const active = occurrences.filter((occurrence) => occurrence.state !== 'superseded').length;
  if (active - delta.supersede.length + delta.create.length > MAX_OCCURRENCES_PER_PLAN) {
    throw new AppError(422, 'occurrence_cap_exceeded', 'Plan occurrence cap exceeded');
  }

  const id = randomUUID();
  const now = runtime.clock.nowUtc();
  const expiresAt = new Date(Date.parse(now) + PREVIEW_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO schedule_previews
       (id, plan_id, control_id, base_plan_revision, engine_epoch, requested_schedule_json, delta_json, expires_at, consumed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    id,
    planId,
    controlId,
    plan.data_revision,
    runtime.engineEpoch,
    JSON.stringify(input),
    JSON.stringify(delta),
    expiresAt,
    now,
    now,
  );

  return toPreviewDto(id, controlId, input, plan.data_revision, expiresAt, delta, occurrences);
}

export type ScheduleApplyResult = {
  control: ControlDto;
  delta_counts: { keep: number; supersede: number; create: number };
};

export async function applySchedulePreview(
  runtime: Runtime,
  planId: string,
  controlId: string,
  previewId: string,
  source: AuditSource,
): Promise<ScheduleApplyResult> {
  const preview = runtime.db.db
    .prepare('SELECT * FROM schedule_previews WHERE id = ? AND plan_id = ? AND control_id = ?')
    .get(previewId, planId, controlId) as PreviewRow | undefined;
  if (!preview) throw new AppError(404, 'preview_not_found', 'Schedule preview not found');

  const storedDelta = JSON.parse(preview.delta_json) as ScheduleDelta;
  const hasEffect = storedDelta.supersede.length > 0 || storedDelta.create.length > 0;
  if (hasEffect) {
    await createBackup(runtime, 'pre_schedule_change');
  }

  return withPlanMutation({ db: runtime.db, clock: runtime.clock }, planId, source, (tx) => {
    const plan = tx.db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as PlanRow;
    const current = tx.db
      .prepare('SELECT * FROM schedule_previews WHERE id = ? AND plan_id = ? AND control_id = ?')
      .get(previewId, planId, controlId) as PreviewRow | undefined;
    if (!current) throw new AppError(404, 'preview_not_found', 'Schedule preview not found');
    if (current.consumed_at) throw new AppError(409, 'preview_consumed', 'Preview already consumed');
    if (current.engine_epoch !== runtime.engineEpoch) {
      throw new AppError(409, 'preview_stale', 'Preview belongs to a previous epoch');
    }
    if (Date.parse(current.expires_at) <= Date.parse(tx.nowUtc)) {
      throw new AppError(409, 'preview_expired', 'Preview expired');
    }
    if (current.base_plan_revision !== plan.data_revision) {
      throw new AppError(409, 'preview_stale', 'Business data changed since preview');
    }

    const control = controlInPlan(tx.db, planId, controlId);
    const requested = JSON.parse(current.requested_schedule_json) as ScheduleChangeInput;
    const delta = JSON.parse(current.delta_json) as ScheduleDelta;

    const active = (
      tx.db
        .prepare(
          `SELECT COUNT(*) AS n FROM occurrences WHERE control_id = ? AND state IN ('open','completed')`,
        )
        .get(controlId) as { n: number }
    ).n;
    if (active - delta.supersede.length + delta.create.length > MAX_OCCURRENCES_PER_PLAN) {
      throw new AppError(422, 'occurrence_cap_exceeded', 'Plan occurrence cap exceeded');
    }

    for (const id of delta.supersede) {
      tx.db
        .prepare("UPDATE occurrences SET state = 'superseded', updated_at = ? WHERE id = ? AND state = 'open'")
        .run(tx.nowUtc, id);
    }
    const insertOccurrence = tx.db.prepare(
      `INSERT INTO occurrences (id, control_id, occurrence_date, state, created_at, updated_at)
       VALUES (?, ?, ?, 'open', ?, ?)`,
    );
    for (const date of delta.create) {
      insertOccurrence.run(randomUUID(), controlId, date, tx.nowUtc, tx.nowUtc);
    }

    const definitionChanged =
      JSON.stringify({
        schedule: requested.schedule,
        active_from: requested.active_from,
        active_to: requested.active_to,
      }) !==
      JSON.stringify({
        schedule: rowToSchedule(control),
        active_from: control.active_from,
        active_to: control.active_to,
      });

    if (definitionChanged) {
      const storage = scheduleToStorage(requested.schedule);
      tx.db
        .prepare(
          `UPDATE controls
              SET frequency_kind = ?, anchor_date = ?, explicit_dates_json = ?,
                  active_from = ?, active_to = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(
          storage.frequency_kind,
          storage.anchor_date,
          storage.explicit_dates_json,
          requested.active_from,
          requested.active_to,
          tx.nowUtc,
          controlId,
        );
    }

    tx.db
      .prepare('UPDATE schedule_previews SET consumed_at = ?, updated_at = ? WHERE id = ?')
      .run(tx.nowUtc, tx.nowUtc, previewId);

    const updated = tx.db.prepare('SELECT * FROM controls WHERE id = ?').get(controlId) as ControlRow;

    if (definitionChanged || hasEffect) {
      tx.audit({
        entity_type: 'control',
        entity_id: controlId,
        plan_id: planId,
        control_id: controlId,
        action: 'schedule_change',
        before: toControlDto(tx.db, control),
        after: toControlDto(tx.db, updated),
      });
      tx.markChanged();
    }

    return {
      control: toControlDto(tx.db, updated),
      delta_counts: {
        keep: delta.keep.length,
        supersede: delta.supersede.length,
        create: delta.create.length,
      },
    };
  });
}
