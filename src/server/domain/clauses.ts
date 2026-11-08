import type BetterSqlite3 from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { AppError } from '../http/errors';
import { ensureReferential } from './referentials';

export type ClauseDto = {
  id: string;
  referential: string | null;
  code: string;
  title: string;
  created_at: string;
};

export function clausesForControl(db: BetterSqlite3.Database, controlId: string): string[] {
  return db
    .prepare(
      `SELECT cl.code
       FROM control_clauses cc
       JOIN clauses cl ON cl.id = cc.clause_id
       WHERE cc.control_id = ?
       ORDER BY cl.code`,
    )
    .all(controlId)
    .map((row) => (row as { code: string }).code);
}

export function listClauses(db: BetterSqlite3.Database, referentialSlug?: string): ClauseDto[] {
  const rows = referentialSlug
    ? db
        .prepare(
          `SELECT c.id, r.slug AS referential, c.code, c.title, c.created_at
           FROM clauses c
           LEFT JOIN referentials r ON r.id = c.referential_id
           WHERE r.slug = ?
           ORDER BY c.code`,
        )
        .all(referentialSlug)
    : db
        .prepare(
          `SELECT c.id, r.slug AS referential, c.code, c.title, c.created_at
           FROM clauses c
           LEFT JOIN referentials r ON r.id = c.referential_id
           ORDER BY COALESCE(r.slug,''), c.code`,
        )
        .all();
  return rows as ClauseDto[];
}

export function createClause(
  db: BetterSqlite3.Database,
  params: { referentialSlug?: string | null; code: string; title: string; nowUtc: string },
): ClauseDto {
  const id = randomUUID();
  const rid = params.referentialSlug
    ? ensureReferential(db, params.referentialSlug, params.referentialSlug, params.nowUtc)
    : null;
  db.prepare(
    `INSERT INTO clauses (id, referential_id, code, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, rid, params.code, params.title, params.nowUtc, params.nowUtc);
  return {
    id,
    referential: params.referentialSlug ?? null,
    code: params.code,
    title: params.title,
    created_at: params.nowUtc,
  };
}

export function setControlClauses(
  db: BetterSqlite3.Database,
  controlId: string,
  clauseIds: string[],
  nowUtc: string,
): void {
  if (clauseIds.length > 0) {
    const placeholders = clauseIds.map(() => '?').join(', ');
    const rows = db
      .prepare(`SELECT id FROM clauses WHERE id IN (${placeholders})`)
      .all(...clauseIds) as Array<{ id: string }>;
    const known = new Set(rows.map((row) => row.id));
    const unknown = clauseIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new AppError(422, 'validation_error', 'Unknown clause ids', { clause_ids: unknown });
    }
  }
  db.prepare('DELETE FROM control_clauses WHERE control_id = ?').run(controlId);
  const insert = db.prepare(
    'INSERT OR IGNORE INTO control_clauses (control_id, clause_id, created_at) VALUES (?, ?, ?)',
  );
  for (const clauseId of clauseIds) {
    insert.run(controlId, clauseId, nowUtc);
  }
}