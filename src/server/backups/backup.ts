import { randomUUID } from 'node:crypto';
import type { Runtime } from '../runtime';
import { ensurePrivateDir } from '../storage/paths';
import {
  type BackupDto,
  type BackupReason,
  applyRetention,
  backupDir,
  backupSqlitePath,
  fileSize,
  sha256File,
  toBackupDto,
  verifySqliteFile,
  writeManifest,
} from './catalog';

/**
 * Creates a coherent backup with `better-sqlite3.backup()` (never a raw copy of
 * an open WAL database), verifies it, then writes an external JSON manifest.
 * A failure here must abort the dependent business operation.
 */
export async function createBackup(runtime: Runtime, reason: BackupReason): Promise<BackupDto> {
  ensurePrivateDir(backupDir(runtime.dataDir));
  const id = randomUUID();
  const sqlitePath = backupSqlitePath(runtime.dataDir, id);

  await runtime.db.db.backup(sqlitePath);
  const schemaVersion = verifySqliteFile(sqlitePath);
  const sha256 = sha256File(sqlitePath);
  const manifest = {
    format_version: 1 as const,
    id,
    reason,
    created_at: runtime.clock.nowUtc(),
    sha256,
    size_bytes: fileSize(sqlitePath),
    schema_version: schemaVersion,
  };

  writeManifest(runtime.dataDir, manifest);
  applyRetention(runtime.dataDir);
  return toBackupDto(manifest);
}
