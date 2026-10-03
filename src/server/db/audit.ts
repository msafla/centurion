import { randomUUID } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
import type { AuditDto, Page } from '../../shared/schemas';
import { AppError } from '../http/errors';

export type AuditSource = 'api' | 'mcp' | 'import' | 'system';

export type AuditEvent = {
  entity_type: string;
  entity_id: string;
  plan_id: string | null;
  control_id: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
};

const MAX_SNAPSHOT_BYTES = 64 * 1024;

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text, 'utf8') > MAX_SNAPSHOT_BYTES) {
    throw new AppError(422, 'audit_snapshot_too_large', 'Audit snapshot exceeds 64 KiB');
  }
  return text;
}

type AuditRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  at_utc: string;
  before_json: string | null;
  after_json: string | null;
  source: AuditSource;
};

function parseJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function listAuditEvents(
  db: BetterSqlite3.Database,
  planId: string,
  controlId: string,
  page: number,
  pageSize: number,
): Page<AuditDto> {
  const total = (
    db
      .prepare(
        'SELECT COUNT(*) AS n FROM audit_events WHERE plan_id = ? AND control_id = ?',
      )
      .get(planId, controlId) as { n: number }
  ).n;
  const rows = db
    .prepare(
      `SELECT id, entity_type, entity_id, action, at_utc, before_json, after_json, source
         FROM audit_events
        WHERE plan_id = ? AND control_id = ?
        ORDER BY at_utc DESC, id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(planId, controlId, pageSize, (page - 1) * pageSize) as AuditRow[];
  return {
    items: rows.map((row) => ({
      id: row.id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: row.action,
      at_utc: row.at_utc,
      source: row.source,
      before: parseJson(row.before_json),
      after: parseJson(row.after_json),
    })),
    page,
    page_size: pageSize,
    total,
  };
}

export function insertAudit(
  db: BetterSqlite3.Database,
  event: AuditEvent,
  source: AuditSource,
  atUtc: string,
): void {
  db.prepare(
    `INSERT INTO audit_events
       (id, entity_type, entity_id, plan_id, control_id, action, at_utc, before_json, after_json, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    event.entity_type,
    event.entity_id,
    event.plan_id,
    event.control_id,
    event.action,
    atUtc,
    serialize(event.before),
    serialize(event.after),
    source,
    atUtc,
  );
}
