import { readFileSync } from 'node:fs';
import type BetterSqlite3 from 'better-sqlite3';
import {
  type ControlMetadata,
  CreateControlInputSchema,
  type ImportMappingInput,
  type Schedule,
} from '../../shared/schemas';
import { MAX_OCCURRENCES_PER_PLAN } from '../../shared/limits';
import type { ControlRow, PlanRow } from '../db/database';
import { metadataOf, rowToSchedule } from '../domain/controls';
import { type ReferentialToken, resolveReferentialTokens } from '../domain/referentials';
import { computeScheduleDelta } from '../domain/schedule';
import { AppError, zodFields } from '../http/errors';
import type { Runtime } from '../runtime';
import { parseCsv } from './parse-csv';
import { parseXlsx } from './parse-xlsx';
import { importFilePath } from './upload';

export type ImportRowDto = {
  row_number: number;
  code: string | null;
  action: 'create' | 'update' | 'unchanged' | 'invalid';
  field_errors: Record<string, string[]>;
  metadata_diff: { before: unknown; after: unknown };
  schedule_delta_counts: { keep: number; supersede: number; create: number };
};

export type NormalizedAction = {
  code: string;
  action: 'create' | 'update';
  existing_id: string | null;
  metadata: ControlMetadata;
  schedule: Schedule;
  active_from: string | null;
  active_to: string | null;
  referential_tokens: ReferentialToken[];
  delta: { keep: string[]; supersede: string[]; create: string[] };
};

export type NormalizedImport = {
  effective_date: string;
  counts: { create: number; update: number; unchanged: number; invalid: number };
  rows: ImportRowDto[];
  actions: NormalizedAction[];
};

function parseAutomated(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (['', 'non', 'no', 'false', '0'].includes(normalized)) return false;
  if (['oui', 'yes', 'true', '1'].includes(normalized)) return true;
  return null;
}

function buildSchedule(
  frequency: string,
  anchor: string,
  explicit: string,
): Schedule | { error: string } {
  const anchorValue = anchor.trim();
  const explicitDates = explicit
    .split('|')
    .map((value) => value.trim())
    .filter(Boolean);
  switch (frequency.trim()) {
    case 'once':
      return { kind: 'once', date: anchorValue };
    case 'monthly':
    case 'quarterly':
    case 'semiannual':
    case 'annual':
      return { kind: frequency.trim() as 'monthly', anchorDate: anchorValue };
    case 'explicit':
      return { kind: 'explicit', dates: explicitDates };
    default:
      return { error: 'invalid_frequency' };
  }
}

export function buildNormalizedImport(
  db: BetterSqlite3.Database,
  plan: PlanRow,
  rows: string[][],
  mapping: ImportMappingInput,
): NormalizedImport {
  const columns = mapping.columns;
  const cell = (row: string[], key: keyof typeof columns): string => {
    const index = columns[key];
    if (index === undefined) return '';
    return row[index] ?? '';
  };

  const result: NormalizedImport = {
    effective_date: mapping.effective_date,
    counts: { create: 0, update: 0, unchanged: 0, invalid: 0 },
    rows: [],
    actions: [],
  };

  const seenCodes = new Set<string>();

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    if (row.every((value) => value.trim() === '')) continue;

    const rowNumber = index + 1;
    const schedule = buildSchedule(
      cell(row, 'frequency_kind'),
      cell(row, 'anchor_date'),
      cell(row, 'explicit_dates'),
    );
    const automated = parseAutomated(cell(row, 'automated'));

    if ('error' in schedule || automated === null) {
      result.counts.invalid += 1;
      result.rows.push({
        row_number: rowNumber,
        code: cell(row, 'code') || null,
        action: 'invalid',
        field_errors: { _: ['invalid_frequency_or_automated'] },
        metadata_diff: { before: null, after: null },
        schedule_delta_counts: { keep: 0, supersede: 0, create: 0 },
      });
      continue;
    }

    const referentialTokens = resolveReferentialTokens(cell(row, 'referentiel'));
    const candidate = {
      code: cell(row, 'code'),
      title: cell(row, 'title'),
      description: cell(row, 'description'),
      referentials: referentialTokens.map((token) => token.slug),
      reference: cell(row, 'reference'),
      domain: cell(row, 'domain'),
      owner_name: cell(row, 'owner_name'),
      method: cell(row, 'method'),
      expected_evidence: cell(row, 'expected_evidence'),
      automated,
      automation_github_url: cell(row, 'automation_github_url') || null,
      schedule,
      active_from: cell(row, 'active_from') || null,
      active_to: cell(row, 'active_to') || null,
    };

    const parsed = CreateControlInputSchema.safeParse(candidate);
    if (!parsed.success) {
      result.counts.invalid += 1;
      result.rows.push({
        row_number: rowNumber,
        code: cell(row, 'code') || null,
        action: 'invalid',
        field_errors: zodFields(parsed.error),
        metadata_diff: { before: null, after: null },
        schedule_delta_counts: { keep: 0, supersede: 0, create: 0 },
      });
      continue;
    }

    const input = parsed.data;
    if (seenCodes.has(input.code)) {
      result.counts.invalid += 1;
      result.rows.push({
        row_number: rowNumber,
        code: input.code,
        action: 'invalid',
        field_errors: { code: ['duplicate_in_file'] },
        metadata_diff: { before: null, after: null },
        schedule_delta_counts: { keep: 0, supersede: 0, create: 0 },
      });
      continue;
    }
    seenCodes.add(input.code);

    const metadata: ControlMetadata = {
      title: input.title,
      description: input.description,
      referentials: input.referentials,
      reference: input.reference,
      domain: input.domain,
      owner_name: input.owner_name,
      method: input.method,
      expected_evidence: input.expected_evidence,
      automated: input.automated,
      automation_github_url: input.automation_github_url,
    };

    const existing = db
      .prepare('SELECT * FROM controls WHERE plan_id = ? AND code = ?')
      .get(plan.id, input.code) as ControlRow | undefined;

    if (existing?.status === 'archived') {
      result.counts.invalid += 1;
      result.rows.push({
        row_number: rowNumber,
        code: input.code,
        action: 'invalid',
        field_errors: { code: ['archived_control'] },
        metadata_diff: { before: metadataOf(db, existing), after: metadata },
        schedule_delta_counts: { keep: 0, supersede: 0, create: 0 },
      });
      continue;
    }

    const window = { active_from: input.active_from, active_to: input.active_to };
    if (!existing) {
      result.counts.create += 1;
      result.actions.push({
        code: input.code,
        action: 'create',
        existing_id: null,
        metadata,
        schedule: input.schedule,
        active_from: input.active_from,
        active_to: input.active_to,
        referential_tokens: referentialTokens,
        delta: { keep: [], supersede: [], create: [] },
      });
      result.rows.push({
        row_number: rowNumber,
        code: input.code,
        action: 'create',
        field_errors: {},
        metadata_diff: { before: null, after: metadata },
        schedule_delta_counts: { keep: 0, supersede: 0, create: 0 },
      });
      continue;
    }

    const before = metadataOf(db, existing);
    const sameMetadata = JSON.stringify(before) === JSON.stringify(metadata);
    const sameSchedule =
      JSON.stringify(rowToSchedule(existing)) === JSON.stringify(input.schedule) &&
      existing.active_from === input.active_from &&
      existing.active_to === input.active_to;

    if (sameMetadata && sameSchedule) {
      result.counts.unchanged += 1;
      result.rows.push({
        row_number: rowNumber,
        code: input.code,
        action: 'unchanged',
        field_errors: {},
        metadata_diff: { before, after: metadata },
        schedule_delta_counts: { keep: 0, supersede: 0, create: 0 },
      });
      continue;
    }

    const occurrences = db
      .prepare(
        'SELECT id, occurrence_date AS date, state FROM occurrences WHERE control_id = ? ORDER BY occurrence_date, id',
      )
      .all(existing.id) as { id: string; date: string; state: 'open' | 'completed' | 'superseded' }[];
    const delta = computeScheduleDelta({
      year: plan.year,
      occurrences,
      newSchedule: input.schedule,
      newWindow: window,
      effectiveDate: mapping.effective_date,
    });

    result.counts.update += 1;
    result.actions.push({
      code: input.code,
      action: 'update',
      existing_id: existing.id,
      metadata,
      schedule: input.schedule,
      active_from: input.active_from,
      active_to: input.active_to,
      referential_tokens: referentialTokens,
      delta,
    });
    result.rows.push({
      row_number: rowNumber,
      code: input.code,
      action: 'update',
      field_errors: {},
      metadata_diff: { before, after: metadata },
      schedule_delta_counts: {
        keep: delta.keep.length,
        supersede: delta.supersede.length,
        create: delta.create.length,
      },
    });
  }

  return result;
}

export function computePreview(
  runtime: Runtime,
  plan: PlanRow,
  importId: string,
  mapping: ImportMappingInput,
  rows: string[][],
): NormalizedImport {
  const normalized = buildNormalizedImport(runtime.db.db, plan, rows, mapping);

  const projected =
    (
      runtime.db.db
        .prepare(
          `SELECT COUNT(*) AS n FROM occurrences o
             JOIN controls c ON c.id = o.control_id
            WHERE c.plan_id = ? AND o.state IN ('open','completed')`,
        )
        .get(plan.id) as { n: number }
    ).n +
    normalized.actions.reduce(
      (total, action) => total + (action.action === 'create' ? 1 : action.delta.create.length),
      0,
    );
  if (projected > MAX_OCCURRENCES_PER_PLAN) {
    throw new AppError(422, 'occurrence_cap_exceeded', 'Plan occurrence cap exceeded');
  }

  const now = runtime.clock.nowUtc();
  runtime.db.db
    .prepare(
      `UPDATE import_runs
          SET mapping_json = ?, normalized_preview_json = ?, base_plan_revision = ?,
              status = 'preview', updated_at = ?
        WHERE id = ? AND plan_id = ?`,
    )
    .run(JSON.stringify(mapping), JSON.stringify(normalized), plan.data_revision, now, importId, plan.id);

  return normalized;
}

export type ImportRunRow = {
  id: string;
  plan_id: string;
  stored_file_id: string;
  original_filename: string;
  source_hash_sha256: string;
  normalized_preview_json: string | null;
  base_plan_revision: number | null;
  engine_epoch: string;
  status: string;
  expires_at: string;
  applied_at: string | null;
};

export function loadImportRun(
  db: BetterSqlite3.Database,
  planId: string,
  importId: string,
): ImportRunRow {
  const run = db
    .prepare('SELECT * FROM import_runs WHERE id = ? AND plan_id = ?')
    .get(importId, planId) as ImportRunRow | undefined;
  if (!run) throw new AppError(404, 'not_found', 'Import not found');
  return run;
}

export type ImportPreviewDto = {
  import_id: string;
  expires_at: string;
  counts: NormalizedImport['counts'];
  can_apply: boolean;
  rows: { items: ImportRowDto[]; page: number; page_size: number; total: number };
};

export function getImportPreview(
  runtime: Runtime,
  planId: string,
  importId: string,
  page: number,
  pageSize: number,
): ImportPreviewDto {
  const run = loadImportRun(runtime.db.db, planId, importId);
  if (!run.normalized_preview_json) {
    throw new AppError(409, 'import_not_ready', 'Import preview is not ready');
  }
  const normalized = JSON.parse(run.normalized_preview_json) as NormalizedImport;
  const start = (page - 1) * pageSize;
  return {
    import_id: importId,
    expires_at: run.expires_at,
    counts: normalized.counts,
    can_apply: normalized.counts.invalid === 0,
    rows: {
      items: normalized.rows.slice(start, start + pageSize),
      page,
      page_size: pageSize,
      total: normalized.rows.length,
    },
  };
}

export function readImportBuffer(runtime: Runtime, importId: string): Buffer {
  return readFileSync(importFilePath(runtime.dataDir, importId));
}

export { parseCsv, parseXlsx };
