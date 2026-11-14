import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { BackupDto } from '../../shared/schemas';
import { CURRENT_SCHEMA_VERSION } from '../db/migrate';
import { ensurePrivateDir } from '../storage/paths';

export type BackupReason =
  | 'manual'
  | 'pre_import'
  | 'pre_schedule_change'
  | 'pre_archive'
  | 'pre_restore';

export const BACKUP_REASONS: BackupReason[] = [
  'manual',
  'pre_import',
  'pre_schedule_change',
  'pre_archive',
  'pre_restore',
];

export type BackupManifest = {
  format_version: 1;
  id: string;
  reason: BackupReason;
  created_at: string;
  sha256: string;
  size_bytes: number;
  schema_version: number;
};

export type { BackupDto } from '../../shared/schemas';

export function backupDir(dataDir: string): string {
  return join(dataDir, 'backups');
}

export function backupSqlitePath(dataDir: string, id: string): string {
  return join(backupDir(dataDir), `${id}.sqlite`);
}

export function backupManifestPath(dataDir: string, id: string): string {
  return join(backupDir(dataDir), `${id}.json`);
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function writeManifest(dataDir: string, manifest: BackupManifest): void {
  ensurePrivateDir(backupDir(dataDir));
  const target = backupManifestPath(dataDir, manifest.id);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest), { mode: 0o600 });
  renameSync(tmp, target);
}

export function readManifest(dataDir: string, id: string): BackupManifest | null {
  const path = backupManifestPath(dataDir, id);
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<BackupManifest>;
    if (
      value.format_version !== 1 ||
      value.id !== id ||
      typeof value.reason !== 'string' ||
      typeof value.created_at !== 'string' ||
      typeof value.sha256 !== 'string' ||
      typeof value.size_bytes !== 'number' ||
      typeof value.schema_version !== 'number'
    ) {
      return null;
    }
    return value as BackupManifest;
  } catch {
    return null;
  }
}

export function listManifests(dataDir: string): BackupManifest[] {
  const dir = backupDir(dataDir);
  if (!existsSync(dir)) return [];
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  return files
    .filter((file) => file.endsWith('.json'))
    .map((file) => readManifest(dataDir, file.slice(0, -'.json'.length)))
    .filter((manifest): manifest is BackupManifest => manifest !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}

export function toBackupDto(manifest: BackupManifest): BackupDto {
  return {
    id: manifest.id,
    reason: manifest.reason,
    created_at: manifest.created_at,
    sha256: manifest.sha256,
    size_bytes: manifest.size_bytes,
    schema_version: manifest.schema_version,
  };
}

/** Verifies integrity, foreign keys and schema version of a closed SQLite file. */
export function verifySqliteFile(path: string): number {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error('integrity_check_failed');
    if ((db.pragma('foreign_key_check') as unknown[]).length > 0) {
      throw new Error('foreign_key_check_failed');
    }
    return db.pragma('user_version', { simple: true }) as number;
  } finally {
    db.close();
  }
}

export function assertSchemaSupported(schemaVersion: number): void {
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error('schema_too_new');
  }
}

/**
 * Retention: keep every manual backup, the newest pre_restore, and the 20
 * newest automatic backups. Backups are not business records, so removing
 * their files is allowed.
 */
export function applyRetention(dataDir: string): void {
  const manifests = listManifests(dataDir);
  const keep = new Set<string>();
  for (const manifest of manifests) {
    if (manifest.reason === 'manual') keep.add(manifest.id);
  }
  const newestPreRestore = manifests.find((manifest) => manifest.reason === 'pre_restore');
  if (newestPreRestore) keep.add(newestPreRestore.id);
  const automatic = manifests.filter(
    (manifest) => manifest.reason !== 'manual' && manifest.reason !== 'pre_restore',
  );
  for (const manifest of automatic.slice(0, 20)) keep.add(manifest.id);

  for (const manifest of manifests) {
    if (keep.has(manifest.id)) continue;
    rmSync(backupSqlitePath(dataDir, manifest.id), { force: true });
    rmSync(backupManifestPath(dataDir, manifest.id), { force: true });
  }
}

export function fileSize(path: string): number {
  return statSync(path).size;
}
