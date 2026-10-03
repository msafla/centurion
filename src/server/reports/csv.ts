import type BetterSqlite3 from 'better-sqlite3';
import type { FilterInput } from '../../shared/schemas';
import { buildOccurrenceFilter } from '../domain/queries';
import { AppError } from '../http/errors';

const CSV_MAX_BYTES = 64 * 1024 * 1024;

export const CSV_HEADERS = [
  'code',
  'title',
  'description',
  'referentiel',
  'reference',
  'domain',
  'owner_name',
  'method',
  'expected_evidence',
  'automated',
  'automation_github_url',
  'frequency',
  'date',
  'fait',
  'conformite',
  'comment',
  'evidence_ref',
] as const;

function needsNeutralization(value: string): boolean {
  if (value === '') return false;
  const first = value[0];
  if (first === '\t' || first === '\r' || first === '\n') return true;
  const trimmed = value.replace(/^[ \t\r\n]+/, '');
  const significant = trimmed[0];
  return significant === '=' || significant === '+' || significant === '-' || significant === '@';
}

function quote(value: string): string {
  const neutralized = needsNeutralization(value) ? `'${value}` : value;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

type CsvRow = {
  code: string;
  title: string;
  description: string;
  referentials: string | null;
  reference: string;
  domain: string;
  owner_name: string;
  method: string;
  expected_evidence: string;
  automated: number;
  automation_github_url: string | null;
  frequency_kind: string;
  occurrence_date: string;
  state: string;
  fait: number | null;
  conformite: string | null;
  comment: string | null;
  evidence_ref: string | null;
};

/**
 * Exports every filtered occurrence (ignoring pagination). Text cells are
 * neutralized for spreadsheet formulas at export time only; SQLite is never
 * modified.
 */
export function buildCsv(db: BetterSqlite3.Database, planId: string, filter: FilterInput): string {
  const { where, params } = buildOccurrenceFilter(planId, filter);
  const rows = db
    .prepare(
      `SELECT c.code, c.title, c.description,
              (SELECT GROUP_CONCAT(r.slug, '|') FROM control_referentials cr
                 JOIN referentials r ON r.id = cr.referential_id
                WHERE cr.control_id = c.id ORDER BY r.slug) AS referentials,
              c.reference, c.domain,
              c.owner_name, c.method, c.expected_evidence, c.automated, c.automation_github_url,
              c.frequency_kind, o.occurrence_date, o.state,
              r.fait, r.conformite, r.comment, r.evidence_ref
         FROM occurrences o
         JOIN controls c ON c.id = o.control_id
         LEFT JOIN realizations r ON r.occurrence_id = o.id
        WHERE ${where}
        ORDER BY o.occurrence_date, c.code, o.id`,
    )
    .all(...params) as CsvRow[];

  const lines: string[] = [CSV_HEADERS.map(quote).join(';')];
  for (const row of rows) {
    const isOpen = row.state === 'open';
    const fait = isOpen ? '' : row.fait === 1 ? 'Oui' : 'Non';
    const conformite = isOpen ? '' : row.fait === 1 ? (row.conformite ?? '') : 'N/A';
    const comment = isOpen ? '' : (row.comment ?? '');
    const evidence = !isOpen && row.fait === 1 ? (row.evidence_ref ?? '') : '';
    lines.push(
      [
        row.code,
        row.title,
        row.description,
        row.referentials ?? '',
        row.reference,
        row.domain,
        row.owner_name,
        row.method,
        row.expected_evidence,
        row.automated === 1 ? 'oui' : 'non',
        row.automation_github_url ?? '',
        row.frequency_kind,
        row.occurrence_date,
        fait,
        conformite,
        comment,
        evidence,
      ]
        .map(quote)
        .join(';'),
    );
  }

  const text = `\uFEFF${lines.join('\r\n')}\r\n`;
  if (Buffer.byteLength(text, 'utf8') > CSV_MAX_BYTES) {
    throw new AppError(422, 'export_too_large', 'CSV exceeds 64 MiB; filter the scope');
  }
  return text;
}
