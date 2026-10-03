import { randomUUID } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
import type {
  Conformite,
  OccurrenceDto,
  RealizationDto,
  StatusInput,
} from '../../shared/schemas';
import type { AuditSource } from '../db/audit';
import {
  type ControlRow,
  type MutationDeps,
  type OccurrenceRow,
  type RealizationRow,
  withPlanMutation,
} from '../db/database';
import { occurrenceInPlan } from '../db/scoping';
import { AppError } from '../http/errors';
import { toControlDto } from './controls';

const MIN_COMPLETED_DATE = '2000-01-01';

export function toRealizationDto(row: RealizationRow): RealizationDto {
  return {
    id: row.id,
    occurrence_id: row.occurrence_id,
    completed_date: row.completed_date,
    fait: row.fait === 1,
    conformite: row.conformite as Conformite,
    comment: row.comment,
    evidence_ref: row.evidence_ref,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toOccurrenceDto(
  db: BetterSqlite3.Database,
  occurrence: OccurrenceRow,
): OccurrenceDto {
  const control = db.prepare('SELECT * FROM controls WHERE id = ?').get(occurrence.control_id) as
    | ControlRow
    | undefined;
  if (!control) throw new AppError(404, 'not_found', 'Control not found');
  const realization = db
    .prepare('SELECT * FROM realizations WHERE occurrence_id = ?')
    .get(occurrence.id) as RealizationRow | undefined;
  return {
    id: occurrence.id,
    control_id: occurrence.control_id,
    occurrence_date: occurrence.occurrence_date,
    state: occurrence.state,
    created_at: occurrence.created_at,
    updated_at: occurrence.updated_at,
    control: toControlDto(db, control),
    realization: realization ? toRealizationDto(realization) : null,
  };
}

/**
 * Creates or corrects a realization. The occurrence, its state, the audit and
 * the plan revision are written in one synchronous transaction. A correction
 * keeps the realization UUID; an identical normalized state is a no-op.
 */
export function setOccurrenceStatus(
  deps: MutationDeps,
  planId: string,
  occurrenceId: string,
  input: StatusInput,
  source: AuditSource,
): OccurrenceDto {
  return withPlanMutation(deps, planId, source, (tx) => {
    const occurrence = occurrenceInPlan(tx.db, planId, occurrenceId);
    if (occurrence.state === 'superseded') {
      throw new AppError(409, 'occurrence_superseded', 'Superseded occurrence cannot be filled');
    }

    const today = deps.clock.todayParis();
    if (input.completed_date > today) {
      throw new AppError(422, 'completed_date_in_future', 'Completed date is in the future');
    }
    if (input.completed_date < MIN_COMPLETED_DATE) {
      throw new AppError(422, 'completed_date_out_of_range', 'Completed date is too old');
    }

    const existing = tx.db
      .prepare('SELECT * FROM realizations WHERE occurrence_id = ?')
      .get(occurrenceId) as RealizationRow | undefined;

    const normalized = {
      completed_date: input.completed_date,
      fait: input.fait ? 1 : 0,
      conformite: input.conformite,
      comment: input.comment,
      evidence_ref: input.evidence_ref,
    };

    if (existing) {
      const same =
        existing.completed_date === normalized.completed_date &&
        existing.fait === normalized.fait &&
        existing.conformite === normalized.conformite &&
        existing.comment === normalized.comment &&
        existing.evidence_ref === normalized.evidence_ref;
      if (same) return toOccurrenceDto(tx.db, occurrence);

      tx.db
        .prepare(
          `UPDATE realizations
              SET completed_date = ?, fait = ?, conformite = ?, comment = ?, evidence_ref = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(
          normalized.completed_date,
          normalized.fait,
          normalized.conformite,
          normalized.comment,
          normalized.evidence_ref,
          tx.nowUtc,
          existing.id,
        );
    } else {
      tx.db
        .prepare(
          `INSERT INTO realizations
             (id, occurrence_id, completed_date, fait, conformite, comment, evidence_ref, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          occurrenceId,
          normalized.completed_date,
          normalized.fait,
          normalized.conformite,
          normalized.comment,
          normalized.evidence_ref,
          tx.nowUtc,
          tx.nowUtc,
        );
    }

    const updatedRealization = tx.db
      .prepare('SELECT * FROM realizations WHERE occurrence_id = ?')
      .get(occurrenceId) as RealizationRow;
    const updatedOccurrence = tx.db
      .prepare('SELECT * FROM occurrences WHERE id = ?')
      .get(occurrenceId) as OccurrenceRow;

    tx.audit({
      entity_type: 'realization',
      entity_id: updatedRealization.id,
      plan_id: planId,
      control_id: occurrence.control_id,
      action: existing ? 'correct' : 'set_status',
      before: existing ? toRealizationDto(existing) : null,
      after: toRealizationDto(updatedRealization),
    });
    tx.markChanged();
    return toOccurrenceDto(tx.db, updatedOccurrence);
  });
}
