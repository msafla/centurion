import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { openDatabase } from '../db/database';
import { CURRENT_SCHEMA_VERSION } from '../db/migrate';
import { AppError } from '../http/errors';
import { getMcpPolicy } from '../mcp/policy-store';
import type { Runtime } from '../runtime';
import { ensurePrivateDir } from '../storage/paths';
import { writeRuntimeFiles } from '../storage/runtime-files';
import { createBackup } from './backup';
import { backupSqlitePath, readManifest, sha256File, verifySqliteFile } from './catalog';
import {
  type RestoreJournal,
  type RestorePhase,
  removeJournal,
  writeJournal,
} from './recovery';

const PREVIEW_TTL_MS = 15 * 60 * 1000;

export function restoresDir(dataDir: string): string {
  return join(dataDir, 'restores');
}

type RevisionMap = Record<string, number>;

type RestorePreviewRow = {
  id: string;
  backup_id: string;
  base_global_revisions_json: string;
  source_hash_sha256: string;
  engine_epoch: string;
  expires_at: string;
  consumed_at: string | null;
};

export type RestorePreviewDto = {
  id: string;
  backup_id: string;
  source_hash_sha256: string;
  schema_version: number;
  engine_epoch: string;
  expires_at: string;
  losses: { plans: number; controls: number; occurrences: number; realizations: number };
};

export type RestoreResult = { restored: true; engine_epoch: string };

export type RestoreHooks = { onPhase?: (phase: RestorePhase) => void };

function globalRevisions(db: BetterSqlite3.Database): RevisionMap {
  const rows = db.prepare('SELECT id, data_revision FROM plans').all() as {
    id: string;
    data_revision: number;
  }[];
  const map: RevisionMap = {};
  for (const row of rows) map[row.id] = row.data_revision;
  return map;
}

type Counts = { plans: number; controls: number; occurrences: number; realizations: number };

function counts(db: BetterSqlite3.Database): Counts {
  return {
    plans: (db.prepare('SELECT COUNT(*) AS c FROM plans').get() as { c: number }).c,
    controls: (db.prepare('SELECT COUNT(*) AS c FROM controls').get() as { c: number }).c,
    occurrences: (db.prepare('SELECT COUNT(*) AS c FROM occurrences').get() as { c: number }).c,
    realizations: (db.prepare('SELECT COUNT(*) AS c FROM realizations').get() as { c: number }).c,
  };
}

function assertInvariants(db: BetterSqlite3.Database): void {
  const realizationOnInactive = db
    .prepare(
      `SELECT COUNT(*) AS c FROM realizations r
         JOIN occurrences o ON o.id = r.occurrence_id
        WHERE o.state NOT IN ('open','completed')`,
    )
    .get() as { c: number };
  const completedWithout = db
    .prepare(
      `SELECT COUNT(*) AS c FROM occurrences o
        WHERE o.state = 'completed'
          AND NOT EXISTS (SELECT 1 FROM realizations WHERE occurrence_id = o.id)`,
    )
    .get() as { c: number };
  const activeWith = db
    .prepare(
      `SELECT COUNT(*) AS c FROM occurrences o
        WHERE o.state IN ('open','superseded')
          AND EXISTS (SELECT 1 FROM realizations WHERE occurrence_id = o.id)`,
    )
    .get() as { c: number };
  if (realizationOnInactive.c > 0 || completedWithout.c > 0 || activeWith.c > 0) {
    throw new Error('restore_invariant_violation');
  }
}

export function createRestorePreview(runtime: Runtime, backupId: string): RestorePreviewDto {
  const manifest = readManifest(runtime.dataDir, backupId);
  if (!manifest) throw new AppError(404, 'backup_not_found', 'Backup not found');
  if (manifest.schema_version > CURRENT_SCHEMA_VERSION) {
    throw new AppError(422, 'schema_too_new', 'Backup schema is newer than current');
  }
  const path = backupSqlitePath(runtime.dataDir, backupId);
  if (!existsSync(path) || sha256File(path) !== manifest.sha256) {
    throw new AppError(422, 'backup_corrupt', 'Backup failed verification');
  }

  const backupDb = openDatabase(path);
  let losses: RestorePreviewDto['losses'];
  try {
    const backupCounts = counts(backupDb.db);
    const currentCounts = counts(runtime.db.db);
    losses = {
      plans: Math.max(0, currentCounts.plans - backupCounts.plans),
      controls: Math.max(0, currentCounts.controls - backupCounts.controls),
      occurrences: Math.max(0, currentCounts.occurrences - backupCounts.occurrences),
      realizations: Math.max(0, currentCounts.realizations - backupCounts.realizations),
    };
  } finally {
    backupDb.close();
  }

  const id = randomUUID();
  const now = runtime.clock.nowUtc();
  const expiresAt = new Date(Date.parse(now) + PREVIEW_TTL_MS).toISOString();
  runtime.db.db
    .prepare(
      `INSERT INTO restore_previews
         (id, backup_id, base_global_revisions_json, source_hash_sha256, engine_epoch, expires_at, consumed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .run(
      id,
      backupId,
      JSON.stringify(globalRevisions(runtime.db.db)),
      manifest.sha256,
      runtime.engineEpoch,
      expiresAt,
      now,
      now,
    );

  return {
    id,
    backup_id: backupId,
    source_hash_sha256: manifest.sha256,
    schema_version: manifest.schema_version,
    engine_epoch: runtime.engineEpoch,
    expires_at: expiresAt,
    losses,
  };
}

export async function restoreBackup(
  runtime: Runtime,
  previewId: string,
  hooks: RestoreHooks = {},
): Promise<RestoreResult> {
  const preview = runtime.db.db
    .prepare('SELECT * FROM restore_previews WHERE id = ?')
    .get(previewId) as RestorePreviewRow | undefined;
  if (!preview) throw new AppError(404, 'preview_not_found', 'Restore preview not found');
  if (preview.consumed_at) throw new AppError(409, 'preview_consumed', 'Preview already consumed');
  if (preview.engine_epoch !== runtime.engineEpoch) {
    throw new AppError(409, 'preview_stale', 'Preview belongs to a previous epoch');
  }
  if (Date.parse(preview.expires_at) <= Date.parse(runtime.clock.nowUtc())) {
    throw new AppError(409, 'preview_expired', 'Preview expired');
  }

  const manifest = readManifest(runtime.dataDir, preview.backup_id);
  if (!manifest) throw new AppError(404, 'backup_not_found', 'Backup not found');
  const sourcePath = backupSqlitePath(runtime.dataDir, preview.backup_id);
  if (
    !existsSync(sourcePath) ||
    sha256File(sourcePath) !== manifest.sha256 ||
    manifest.sha256 !== preview.source_hash_sha256
  ) {
    throw new AppError(409, 'backup_changed', 'Backup content changed since preview');
  }
  if (JSON.stringify(globalRevisions(runtime.db.db)) !== preview.base_global_revisions_json) {
    throw new AppError(409, 'preview_stale', 'Business data changed since preview');
  }

  return runtime.gate.runMaintenance(async () => {
    // 1. pre_restore backup, verified before anything is swapped.
    await createBackup(runtime, 'pre_restore');

    // 2. prepare and verify the candidate.
    ensurePrivateDir(restoresDir(runtime.dataDir));
    const candidateId = randomUUID();
    const candidatePath = join(restoresDir(runtime.dataDir), `${candidateId}.candidate.sqlite`);
    copyFileSync(sourcePath, candidatePath);
    const candidate = openDatabase(candidatePath);
    try {
      candidate.db.exec(
        'DELETE FROM schedule_previews; DELETE FROM import_runs; DELETE FROM mcp_proposals; DELETE FROM restore_previews;',
      );
      assertInvariants(candidate.db);
      candidate.db.pragma('wal_checkpoint(TRUNCATE)');
    } finally {
      candidate.close();
    }
    verifySqliteFile(candidatePath);

    // 3. checkpoint, close, hash and journal `prepared`.
    const mainPath = join(runtime.dataDir, 'centurion.sqlite');
    runtime.db.db.pragma('wal_checkpoint(TRUNCATE)');
    runtime.db.close();

    const previousId = randomUUID();
    const previousPath = join(restoresDir(runtime.dataDir), `${previousId}.previous.sqlite`);
    const baseJournal: RestoreJournal = {
      phase: 'prepared',
      candidate_id: candidateId,
      previous_id: previousId,
      candidate_path: candidatePath,
      previous_path: previousPath,
      main_path: mainPath,
      candidate_hash: sha256File(candidatePath),
      previous_hash: sha256File(mainPath),
      updated_at: runtime.clock.nowUtc(),
    };
    writeJournal(runtime.dataDir, baseJournal);
    hooks.onPhase?.('prepared');

    // 4. two renames, journaling each phase.
    renameSync(mainPath, previousPath);
    writeJournal(runtime.dataDir, { ...baseJournal, phase: 'old_moved' });
    hooks.onPhase?.('old_moved');
    renameSync(candidatePath, mainPath);
    writeJournal(runtime.dataDir, { ...baseJournal, phase: 'new_installed' });
    hooks.onPhase?.('new_installed');

    // 5. reopen, audit, new epoch, journal `committed`.
    const reopened = openDatabase(mainPath);
    runtime.replaceDatabase(reopened);
    verifySqliteFile(mainPath);
    const now = runtime.clock.nowUtc();
    reopened.db
      .prepare(
        `INSERT INTO audit_events
           (id, entity_type, entity_id, plan_id, control_id, action, at_utc, before_json, after_json, source, created_at)
         VALUES (?, 'database', ?, NULL, NULL, 'restore_completed', ?, NULL, ?, 'system', ?)`,
      )
      .run(randomUUID(), preview.backup_id, now, JSON.stringify({ backup_id: preview.backup_id }), now);
    const newEpoch = runtime.renewEpoch();
    runtime.mcpToken = writeRuntimeFiles(runtime.dataDir, {
      origin: runtime.config.canonicalOrigin,
      epoch: newEpoch,
      policy: getMcpPolicy(reopened.db),
    });
    writeJournal(runtime.dataDir, {
      ...baseJournal,
      phase: 'committed',
      engine_epoch: newEpoch,
    });
    hooks.onPhase?.('committed');

    // 6. cleanup.
    rmSync(previousPath, { force: true });
    rmSync(`${previousPath}-wal`, { force: true });
    rmSync(`${previousPath}-shm`, { force: true });
    removeJournal(runtime.dataDir);

    return { restored: true, engine_epoch: newEpoch };
  });
}
