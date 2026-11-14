import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { MAX_OCCURRENCES_PER_PLAN } from '../../shared/limits';
import { createBackup } from '../backups/backup';
import { type ControlRow, type PlanRow, withPlanMutation } from '../db/database';
import { insertControl, insertOccurrences, scheduleToStorage, toControlDto } from '../domain/controls';
import { setControlReferentials } from '../domain/referentials';
import { generateDates } from '../domain/schedule';
import { AppError } from '../http/errors';
import type { Runtime } from '../runtime';
import { type NormalizedImport, loadImportRun } from './preview';
import { importFilePath } from './upload';

export type ImportApplyResult = {
  applied: true;
  counts: NormalizedImport['counts'];
};

export async function applyImport(
  runtime: Runtime,
  planId: string,
  importId: string,
): Promise<ImportApplyResult> {
  const run = loadImportRun(runtime.db.db, planId, importId);
  if (run.status !== 'preview' || !run.normalized_preview_json) {
    throw new AppError(409, 'import_not_ready', 'Import is not ready to apply');
  }
  if (run.engine_epoch !== runtime.engineEpoch) {
    throw new AppError(409, 'import_stale', 'Import belongs to a previous epoch');
  }
  if (Date.parse(run.expires_at) <= Date.parse(runtime.clock.nowUtc())) {
    throw new AppError(409, 'import_expired', 'Import expired');
  }

  const normalized = JSON.parse(run.normalized_preview_json) as NormalizedImport;
  if (normalized.counts.invalid > 0) {
    throw new AppError(422, 'import_invalid', 'Import contains invalid rows');
  }

  const hasChanges = normalized.counts.create + normalized.counts.update > 0;
  if (hasChanges) {
    await createBackup(runtime, 'pre_import');
  }

  const result = withPlanMutation({ db: runtime.db, clock: runtime.clock }, planId, 'import', (tx) => {
    const plan = tx.db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as PlanRow;
    const current = loadImportRun(tx.db, planId, importId);
    if (current.status === 'applied') {
      throw new AppError(409, 'import_consumed', 'Import already applied');
    }
    if (current.base_plan_revision !== plan.data_revision) {
      throw new AppError(409, 'import_stale', 'Business data changed since preview');
    }

    const activeBefore = (
      tx.db
        .prepare(
          `SELECT COUNT(*) AS n FROM occurrences o
             JOIN controls c ON c.id = o.control_id
            WHERE c.plan_id = ? AND o.state IN ('open','completed')`,
        )
        .get(planId) as { n: number }
    ).n;

    let projected = activeBefore;
    for (const action of normalized.actions) {
      if (action.action === 'create') {
        projected += generateDates(plan.year, action.schedule, {
          active_from: action.active_from,
          active_to: action.active_to,
        }).length;
      } else {
        projected += action.delta.create.length - action.delta.supersede.length;
      }
    }
    if (projected > MAX_OCCURRENCES_PER_PLAN) {
      throw new AppError(422, 'occurrence_cap_exceeded', 'Plan occurrence cap exceeded');
    }

    for (const action of normalized.actions) {
      if (action.action === 'create') {
        const row = insertControl(tx.db, {
          planId,
          code: action.code,
          metadata: action.metadata,
          schedule: action.schedule,
          active_from: action.active_from,
          active_to: action.active_to,
          nowUtc: tx.nowUtc,
        });
        const dates = generateDates(plan.year, action.schedule, {
          active_from: action.active_from,
          active_to: action.active_to,
        });
        insertOccurrences(tx.db, row.id, dates, tx.nowUtc);
        setControlReferentials(tx.db, row.id, action.referential_tokens, tx.nowUtc);
        tx.audit({
          entity_type: 'control',
          entity_id: row.id,
          plan_id: planId,
          control_id: row.id,
          action: 'import_create',
          after: toControlDto(tx.db, row),
        });
        continue;
      }

      const existing = tx.db
        .prepare('SELECT * FROM controls WHERE id = ?')
        .get(action.existing_id) as ControlRow;
      const before = toControlDto(tx.db, existing);
      for (const id of action.delta.supersede) {
        tx.db
          .prepare("UPDATE occurrences SET state = 'superseded', updated_at = ? WHERE id = ? AND state = 'open'")
          .run(tx.nowUtc, id);
      }
      const statement = tx.db.prepare(
        `INSERT INTO occurrences (id, control_id, occurrence_date, state, created_at, updated_at)
         VALUES (?, ?, ?, 'open', ?, ?)`,
      );
      for (const date of action.delta.create) {
        statement.run(randomUUID(), existing.id, date, tx.nowUtc, tx.nowUtc);
      }
      const storage = scheduleToStorage(action.schedule);
      tx.db
        .prepare(
          `UPDATE controls
              SET title = ?, description = ?, reference = ?, domain = ?,
                  owner_name = ?, method = ?, expected_evidence = ?, automated = ?,
                  automation_github_url = ?, frequency_kind = ?, anchor_date = ?,
                  explicit_dates_json = ?, active_from = ?, active_to = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(
          action.metadata.title,
          action.metadata.description,
          action.metadata.reference,
          action.metadata.domain,
          action.metadata.owner_name,
          action.metadata.method,
          action.metadata.expected_evidence,
          action.metadata.automated ? 1 : 0,
          action.metadata.automation_github_url,
          storage.frequency_kind,
          storage.anchor_date,
          storage.explicit_dates_json,
          action.active_from,
          action.active_to,
          tx.nowUtc,
          existing.id,
        );
      setControlReferentials(tx.db, existing.id, action.referential_tokens, tx.nowUtc);
      const updated = tx.db.prepare('SELECT * FROM controls WHERE id = ?').get(existing.id) as ControlRow;
      tx.audit({
        entity_type: 'control',
        entity_id: existing.id,
        plan_id: planId,
        control_id: existing.id,
        action: 'import_update',
        before,
        after: toControlDto(tx.db, updated),
      });
    }

    tx.db
      .prepare(
        `UPDATE import_runs SET status = 'applied', applied_at = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(tx.nowUtc, tx.nowUtc, importId);

    tx.audit({
      entity_type: 'import',
      entity_id: importId,
      plan_id: planId,
      control_id: null,
      action: 'import_applied',
      after: normalized.counts,
    });

    if (hasChanges) tx.markChanged();

    return { applied: true as const, counts: normalized.counts };
  });

  // Delete the temporary upload only after the transaction committed.
  rmSync(importFilePath(runtime.dataDir, importId), { force: true });
  return result;
}
