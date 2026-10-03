import { randomUUID } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
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
