import { randomUUID } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
import type { ReferentialDto } from '../../shared/schemas';

const ALIASES: Record<string, { slug: string; label: string }> = {
  'iso 27001': { slug: 'iso_27001', label: 'ISO 27001' },
  iso27001: { slug: 'iso_27001', label: 'ISO 27001' },
  'isae 3402 type 2': { slug: 'isae_3402_t2', label: 'ISAE 3402 Type 2' },
  'isae 3402': { slug: 'isae_3402_t2', label: 'ISAE 3402 Type 2' },
  isae3402: { slug: 'isae_3402_t2', label: 'ISAE 3402 Type 2' },
  'pci dss': { slug: 'pci_dss', label: 'PCI DSS' },
  pcidss: { slug: 'pci_dss', label: 'PCI DSS' },
  'soc 2': { slug: 'soc_2', label: 'SOC 2' },
  soc2: { slug: 'soc_2', label: 'SOC 2' },
};

/** Normalizes any label to a lowercase slug usable as a referential key. */
export function slugifyReferential(value: string): string | null {
  const slug = value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return slug === '' ? null : slug;
}

export type ReferentialToken = { slug: string; label: string };

/**
 * Splits a raw referential cell into tokens. `|`, `+`, `,` and `;` all separate
 * referentials, so a combined value maps to several links.
 */
export function resolveReferentialTokens(raw: string): ReferentialToken[] {
  const tokens = raw
    .split(/[|+,;]/)
    .map((token) => token.trim())
    .filter((token) => token !== '');
  const result = new Map<string, string>();
  for (const token of tokens) {
    const key = token.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
    const alias = ALIASES[key];
    if (alias) {
      result.set(alias.slug, alias.label);
      continue;
    }
    const slug = slugifyReferential(token);
    if (slug) result.set(slug, token.normalize('NFC').trim());
  }
  return [...result].map(([slug, label]) => ({ slug, label }));
}

/** Maps slugs to tokens, reusing the catalog label when it exists. */
export function tokensFromSlugs(db: BetterSqlite3.Database, slugs: string[]): ReferentialToken[] {
  const catalog = new Map(listReferentials(db).map((entry) => [entry.slug, entry.label]));
  return [...new Set(slugs)].map((slug) => ({ slug, label: catalog.get(slug) ?? slug }));
}

export function listReferentials(db: BetterSqlite3.Database): ReferentialDto[] {
  return db
    .prepare('SELECT id, slug, label FROM referentials ORDER BY label')
    .all() as ReferentialDto[];
}

/** Returns the referential id, creating the catalog entry when missing. */
export function ensureReferential(
  db: BetterSqlite3.Database,
  slug: string,
  label: string,
  nowUtc: string,
): string {
  const existing = db.prepare('SELECT id FROM referentials WHERE slug = ?').get(slug) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare(
    'INSERT INTO referentials (id, slug, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, slug, label, nowUtc, nowUtc);
  return id;
}

export function referentialsForControl(db: BetterSqlite3.Database, controlId: string): string[] {
  return (
    db
      .prepare(
        `SELECT r.slug FROM control_referentials cr
           JOIN referentials r ON r.id = cr.referential_id
          WHERE cr.control_id = ?
          ORDER BY r.slug`,
      )
      .all(controlId) as { slug: string }[]
  ).map((row) => row.slug);
}

export function referentialsForControls(
  db: BetterSqlite3.Database,
  controlIds: string[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (controlIds.length === 0) return map;
  const placeholders = controlIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT cr.control_id AS control_id, r.slug AS slug FROM control_referentials cr
         JOIN referentials r ON r.id = cr.referential_id
        WHERE cr.control_id IN (${placeholders})
        ORDER BY r.slug`,
    )
    .all(...controlIds) as { control_id: string; slug: string }[];
  for (const row of rows) {
    const list = map.get(row.control_id) ?? [];
    list.push(row.slug);
    map.set(row.control_id, list);
  }
  return map;
}

/** Replaces the referential links of a control, auto-creating unknown slugs. */
export function setControlReferentials(
  db: BetterSqlite3.Database,
  controlId: string,
  tokens: ReferentialToken[],
  nowUtc: string,
): void {
  db.prepare('DELETE FROM control_referentials WHERE control_id = ?').run(controlId);
  const insert = db.prepare(
    'INSERT OR IGNORE INTO control_referentials (control_id, referential_id, created_at) VALUES (?, ?, ?)',
  );
  for (const token of tokens) {
    const referentialId = ensureReferential(db, token.slug, token.label, nowUtc);
    insert.run(controlId, referentialId, nowUtc);
  }
}

export function copyControlReferentials(
  db: BetterSqlite3.Database,
  fromControlId: string,
  toControlId: string,
  nowUtc: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO control_referentials (control_id, referential_id, created_at)
     SELECT ?, referential_id, ? FROM control_referentials WHERE control_id = ?`,
  ).run(toControlId, nowUtc, fromControlId);
}
