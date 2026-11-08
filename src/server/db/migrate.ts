import { readFileSync } from 'node:fs';
import type BetterSqlite3 from 'better-sqlite3';

export const CURRENT_SCHEMA_VERSION = 3;

const MIGRATIONS: { version: number; file: string }[] = [
  { version: 1, file: '001_initial.sql' },
  { version: 2, file: '002_evidence.sql' },
  { version: 3, file: '003_clauses.sql' },
];

function readMigration(file: string): string {
  return readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8');
}

export function migrate(db: BetterSqlite3.Database): number {
  let version = db.pragma('user_version', { simple: true }) as number;
  for (const migration of MIGRATIONS) {
    if (version >= migration.version) continue;
    const sql = readMigration(migration.file);
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${migration.version}`);
    })();
    version = migration.version;
  }
  return version;
}
