import type BetterSqlite3 from 'better-sqlite3';
import type { FilterInput, OccurrenceDto, Page } from '../../shared/schemas';
import type { OccurrenceRow } from '../db/database';
import { toOccurrenceDto } from './realizations';

export type SqlFilter = { where: string; params: unknown[] };

const OCCURRENCE_FILTERS = ['fait', 'conformite', 'state', 'date_from', 'date_to'] as const;

export function hasOccurrenceFilter(filter: FilterInput): boolean {
  return OCCURRENCE_FILTERS.some((key) => filter[key] !== undefined);
}

/**
 * Builds the AND-combined WHERE clause shared by lists, metrics and exports.
 * Superseded rows are excluded unless `state=superseded` is requested.
 */
export function buildOccurrenceFilter(planId: string, filter: FilterInput): SqlFilter {
  const conditions = ['c.plan_id = ?'];
  const params: unknown[] = [planId];

  if (filter.state) {
    conditions.push('o.state = ?');
    params.push(filter.state);
  } else {
    conditions.push("o.state <> 'superseded'");
  }
  if (filter.referentiel) {
    conditions.push(
      `EXISTS (SELECT 1 FROM control_referentials cr
                 JOIN referentials ref ON ref.id = cr.referential_id
                WHERE cr.control_id = c.id AND ref.slug = ?)`,
    );
    params.push(filter.referentiel);
  }
  if (filter.domain) {
    conditions.push('c.domain = ?');
    params.push(filter.domain);
  }
  if (filter.owner_name !== undefined) {
    conditions.push('c.owner_name = ?');
    params.push(filter.owner_name);
  }
  if (filter.automated !== undefined) {
    conditions.push('c.automated = ?');
    params.push(filter.automated ? 1 : 0);
  }
  if (filter.fait === 'unset') {
    conditions.push("o.state = 'open'");
  } else if (filter.fait === 'no') {
    conditions.push("o.state = 'completed' AND r.fait = 0");
  } else if (filter.fait === 'yes') {
    conditions.push("o.state = 'completed' AND r.fait = 1");
  }
  if (filter.conformite) {
    conditions.push("o.state = 'completed' AND r.fait = 1 AND r.conformite = ?");
    params.push(filter.conformite);
  }
  if (filter.date_from) {
    conditions.push('o.occurrence_date >= ?');
    params.push(filter.date_from);
  }
  if (filter.date_to) {
    conditions.push('o.occurrence_date <= ?');
    params.push(filter.date_to);
  }
  if (filter.search) {
    conditions.push(
      "(c.code LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\')",
    );
    const escaped = filter.search.replace(/[\\%_]/g, (match) => `\\${match}`);
    const pattern = `%${escaped}%`;
    params.push(pattern, pattern, pattern);
  }

  return { where: conditions.join(' AND '), params };
}

const OCCURRENCE_FROM = `FROM occurrences o
      JOIN controls c ON c.id = o.control_id
      LEFT JOIN realizations r ON r.occurrence_id = o.id`;

export function listOccurrences(
  db: BetterSqlite3.Database,
  planId: string,
  filter: FilterInput,
  page: number,
  pageSize: number,
): Page<OccurrenceDto> {
  const { where, params } = buildOccurrenceFilter(planId, filter);
  const total = (
    db.prepare(`SELECT COUNT(*) AS n ${OCCURRENCE_FROM} WHERE ${where}`).get(...params) as {
      n: number;
    }
  ).n;
  const rows = db
    .prepare(
      `SELECT o.id, o.control_id, o.occurrence_date, o.state, o.created_at, o.updated_at
       ${OCCURRENCE_FROM}
       WHERE ${where}
       ORDER BY o.occurrence_date, c.code, o.id
       LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as OccurrenceRow[];

  return { items: rows.map((row) => toOccurrenceDto(db, row)), page, page_size: pageSize, total };
}

export { OCCURRENCE_FROM };
