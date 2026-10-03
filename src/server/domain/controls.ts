import { randomUUID } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
import {
  type ControlDto,
  type ControlMetadata,
  ControlMetadataSchema,
  type CreateControlInput,
  type Schedule,
  type UpdateMetadataInput,
} from '../../shared/schemas';
import { DEFINITION_MAX_BYTES, MAX_OCCURRENCES_PER_PLAN } from '../../shared/limits';
import type { AuditSource } from '../db/audit';
import {
  type ControlRow,
  type MutationDeps,
  type PlanRow,
  withPlanMutation,
} from '../db/database';
import { controlInPlan } from '../db/scoping';
import { AppError, parseInput } from '../http/errors';
import { generateDates } from './schedule';

export type ScheduleStorage = {
  frequency_kind: Schedule['kind'];
  anchor_date: string | null;
  explicit_dates_json: string | null;
};

export function scheduleToStorage(schedule: Schedule): ScheduleStorage {
  switch (schedule.kind) {
    case 'once':
      return { frequency_kind: 'once', anchor_date: schedule.date, explicit_dates_json: null };
    case 'explicit':
      return {
        frequency_kind: 'explicit',
        anchor_date: null,
        explicit_dates_json: JSON.stringify(schedule.dates),
      };
    default:
      return {
        frequency_kind: schedule.kind,
        anchor_date: schedule.anchorDate,
        explicit_dates_json: null,
      };
  }
}

export function rowToSchedule(row: ControlRow): Schedule {
  if (row.frequency_kind === 'explicit') {
    return { kind: 'explicit', dates: JSON.parse(row.explicit_dates_json ?? '[]') as string[] };
  }
  if (row.frequency_kind === 'once') {
    return { kind: 'once', date: row.anchor_date ?? '' };
  }
  return {
    kind: row.frequency_kind as 'monthly' | 'quarterly' | 'semiannual' | 'annual',
    anchorDate: row.anchor_date ?? '',
  };
}

export function toControlDto(row: ControlRow): ControlDto {
  return {
    id: row.id,
    plan_id: row.plan_id,
    code: row.code,
    title: row.title,
    description: row.description,
    referentiel: row.referentiel as ControlDto['referentiel'],
    reference: row.reference,
    domain: row.domain,
    owner_name: row.owner_name,
    method: row.method,
    expected_evidence: row.expected_evidence,
    automated: row.automated === 1,
    automation_github_url: row.automation_github_url,
    schedule: rowToSchedule(row),
    active_from: row.active_from,
    active_to: row.active_to,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function metadataOf(row: ControlRow): ControlMetadata {
  return {
    title: row.title,
    description: row.description,
    referentiel: row.referentiel as ControlMetadata['referentiel'],
    reference: row.reference,
    domain: row.domain,
    owner_name: row.owner_name,
    method: row.method,
    expected_evidence: row.expected_evidence,
    automated: row.automated === 1,
    automation_github_url: row.automation_github_url,
  };
}

function assertDefinitionSize(metadata: ControlMetadata): void {
  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > DEFINITION_MAX_BYTES) {
    throw new AppError(422, 'definition_too_large', 'Definition exceeds 48 KiB');
  }
}

export function countActiveOccurrences(db: BetterSqlite3.Database, planId: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM occurrences o
           JOIN controls ct ON ct.id = o.control_id
          WHERE ct.plan_id = ? AND o.state IN ('open','completed')`,
      )
      .get(planId) as { n: number }
  ).n;
}

export function insertControl(
  db: BetterSqlite3.Database,
  params: {
    planId: string;
    code: string;
    metadata: ControlMetadata;
    schedule: Schedule;
    active_from: string | null;
    active_to: string | null;
    nowUtc: string;
  },
): ControlRow {
  const id = randomUUID();
  const storage = scheduleToStorage(params.schedule);
  db.prepare(
    `INSERT INTO controls
       (id, plan_id, code, title, description, referentiel, reference, domain, owner_name,
        method, expected_evidence, automated, automation_github_url, frequency_kind,
        anchor_date, explicit_dates_json, active_from, active_to, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run(
    id,
    params.planId,
    params.code,
    params.metadata.title,
    params.metadata.description,
    params.metadata.referentiel,
    params.metadata.reference,
    params.metadata.domain,
    params.metadata.owner_name,
    params.metadata.method,
    params.metadata.expected_evidence,
    params.metadata.automated ? 1 : 0,
    params.metadata.automation_github_url,
    storage.frequency_kind,
    storage.anchor_date,
    storage.explicit_dates_json,
    params.active_from,
    params.active_to,
    params.nowUtc,
    params.nowUtc,
  );
  return db.prepare('SELECT * FROM controls WHERE id = ?').get(id) as ControlRow;
}

export function insertOccurrences(
  db: BetterSqlite3.Database,
  controlId: string,
  dates: string[],
  nowUtc: string,
): void {
  const statement = db.prepare(
    `INSERT INTO occurrences (id, control_id, occurrence_date, state, created_at, updated_at)
     VALUES (?, ?, ?, 'open', ?, ?)`,
  );
  for (const date of dates) {
    statement.run(randomUUID(), controlId, date, nowUtc, nowUtc);
  }
}

function planRow(db: BetterSqlite3.Database, planId: string): PlanRow {
  return db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as PlanRow;
}

function assertCap(db: BetterSqlite3.Database, planId: string, added: number): void {
  if (countActiveOccurrences(db, planId) + added > MAX_OCCURRENCES_PER_PLAN) {
    throw new AppError(422, 'occurrence_cap_exceeded', 'Plan occurrence cap exceeded');
  }
}

export function assertDefinitionInYear(
  year: number,
  schedule: Schedule,
  window: { active_from: string | null; active_to: string | null },
): void {
  const inYear = (date: string): boolean => Number(date.slice(0, 4)) === year;
  const dates =
    schedule.kind === 'explicit'
      ? schedule.dates
      : [schedule.kind === 'once' ? schedule.date : schedule.anchorDate];
  const bounds = [window.active_from, window.active_to].filter(
    (value): value is string => value !== null,
  );
  if (!dates.every(inYear) || !bounds.every(inYear)) {
    throw new AppError(422, 'date_out_of_year', 'Definition dates must be in the plan year');
  }
}

export function createControl(
  deps: MutationDeps,
  planId: string,
  input: CreateControlInput,
  source: AuditSource,
): { control: ControlDto; occurrences_generated: number } {
  return withPlanMutation(deps, planId, source, (tx) => {
    const plan = planRow(tx.db, planId);
    assertDefinitionSize(input);
    assertDefinitionInYear(plan.year, input.schedule, {
      active_from: input.active_from,
      active_to: input.active_to,
    });
    const existing = tx.db
      .prepare('SELECT 1 FROM controls WHERE plan_id = ? AND code = ?')
      .get(planId, input.code);
    if (existing) throw new AppError(409, 'code_collision', 'Code already exists in this plan');

    const dates = generateDates(plan.year, input.schedule, {
      active_from: input.active_from,
      active_to: input.active_to,
    });
    assertCap(tx.db, planId, dates.length);

    const row = insertControl(tx.db, {
      planId,
      code: input.code,
      metadata: input,
      schedule: input.schedule,
      active_from: input.active_from,
      active_to: input.active_to,
      nowUtc: tx.nowUtc,
    });
    insertOccurrences(tx.db, row.id, dates, tx.nowUtc);
    tx.audit({
      entity_type: 'control',
      entity_id: row.id,
      plan_id: planId,
      control_id: row.id,
      action: 'create',
      after: toControlDto(row),
    });
    tx.markChanged();
    return { control: toControlDto(row), occurrences_generated: dates.length };
  });
}

export function updateControlMetadata(
  deps: MutationDeps,
  planId: string,
  controlId: string,
  patch: UpdateMetadataInput,
  source: AuditSource,
): { control: ControlDto } {
  return withPlanMutation(deps, planId, source, (tx) => {
    const row = controlInPlan(tx.db, planId, controlId);
    if (row.status === 'archived') {
      throw new AppError(409, 'control_archived', 'Archived control cannot be edited');
    }

    const current = metadataOf(row);
    const merged = parseInput(ControlMetadataSchema, { ...current, ...patch });
    assertDefinitionSize(merged);

    if (JSON.stringify(merged) === JSON.stringify(current)) {
      return { control: toControlDto(row) };
    }

    tx.db
      .prepare(
        `UPDATE controls
            SET title = ?, description = ?, referentiel = ?, reference = ?, domain = ?,
                owner_name = ?, method = ?, expected_evidence = ?, automated = ?,
                automation_github_url = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(
        merged.title,
        merged.description,
        merged.referentiel,
        merged.reference,
        merged.domain,
        merged.owner_name,
        merged.method,
        merged.expected_evidence,
        merged.automated ? 1 : 0,
        merged.automation_github_url,
        tx.nowUtc,
        row.id,
      );

    const updated = tx.db.prepare('SELECT * FROM controls WHERE id = ?').get(row.id) as ControlRow;
    tx.audit({
      entity_type: 'control',
      entity_id: row.id,
      plan_id: planId,
      control_id: row.id,
      action: 'update_metadata',
      before: toControlDto(row),
      after: toControlDto(updated),
    });
    tx.markChanged();
    return { control: toControlDto(updated) };
  });
}

export function duplicateControl(
  deps: MutationDeps,
  planId: string,
  controlId: string,
  newCode: string,
  source: AuditSource,
): { control: ControlDto; occurrences_generated: number } {
  return withPlanMutation(deps, planId, source, (tx) => {
    const origin = controlInPlan(tx.db, planId, controlId);
    if (origin.status === 'archived') {
      throw new AppError(409, 'control_archived', 'Archived control cannot be duplicated');
    }
    const plan = planRow(tx.db, planId);
    const schedule = rowToSchedule(origin);
    const dates = generateDates(plan.year, schedule, {
      active_from: origin.active_from,
      active_to: origin.active_to,
    });
    assertCap(tx.db, planId, dates.length);

    const existing = tx.db
      .prepare('SELECT 1 FROM controls WHERE plan_id = ? AND code = ?')
      .get(planId, newCode);
    if (existing) throw new AppError(409, 'code_collision', 'Code already exists in this plan');

    const row = insertControl(tx.db, {
      planId,
      code: newCode,
      metadata: metadataOf(origin),
      schedule,
      active_from: origin.active_from,
      active_to: origin.active_to,
      nowUtc: tx.nowUtc,
    });
    insertOccurrences(tx.db, row.id, dates, tx.nowUtc);
    tx.audit({
      entity_type: 'control',
      entity_id: row.id,
      plan_id: planId,
      control_id: row.id,
      action: 'duplicate',
      after: toControlDto(row),
    });
    tx.markChanged();
    return { control: toControlDto(row), occurrences_generated: dates.length };
  });
}

export function listControls(
  db: BetterSqlite3.Database,
  planId: string,
  filter: {
    status?: 'active' | 'archived' | 'all';
    referentiel?: string;
    domain?: string;
    owner_name?: string;
    automated?: boolean;
    search?: string;
  },
  page: number,
  pageSize: number,
): { items: ControlDto[]; page: number; page_size: number; total: number } {
  const conditions: string[] = ['plan_id = ?'];
  const params: unknown[] = [planId];
  const status = filter.status ?? 'active';
  if (status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (filter.referentiel) {
    conditions.push('referentiel = ?');
    params.push(filter.referentiel);
  }
  if (filter.domain) {
    conditions.push('domain = ?');
    params.push(filter.domain);
  }
  if (filter.owner_name) {
    conditions.push('owner_name = ?');
    params.push(filter.owner_name);
  }
  if (filter.automated !== undefined) {
    conditions.push('automated = ?');
    params.push(filter.automated ? 1 : 0);
  }
  if (filter.search) {
    conditions.push(
      "(code LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')",
    );
    const escaped = filter.search.replace(/[\\%_]/g, (match) => `\\${match}`);
    const pattern = `%${escaped}%`;
    params.push(pattern, pattern, pattern);
  }

  const where = conditions.join(' AND ');
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM controls WHERE ${where}`).get(...params) as { n: number }
  ).n;
  const rows = db
    .prepare(
      `SELECT * FROM controls WHERE ${where} ORDER BY code, id LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as ControlRow[];

  return { items: rows.map(toControlDto), page, page_size: pageSize, total };
}

export function getControlDto(
  db: BetterSqlite3.Database,
  planId: string,
  controlId: string,
): ControlDto {
  return toControlDto(controlInPlan(db, planId, controlId));
}
