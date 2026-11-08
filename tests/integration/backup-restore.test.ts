import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createBackup } from '../../src/server/backups/backup';
import {
  backupManifestPath,
  backupSqlitePath,
  listManifests,
  readManifest,
  sha256File,
} from '../../src/server/backups/catalog';
import { recoverOnStartup } from '../../src/server/backups/recovery';
import { createRestorePreview, restoreBackup } from '../../src/server/backups/restore';
import { fixedClock } from '../../src/server/clock';
import { loadConfig } from '../../src/server/config';
import { type DatabaseHandle, openDatabase } from '../../src/server/db/database';
import { Runtime } from '../../src/server/runtime';
import { OperationGate } from '../../src/server/storage/operation-gate';
import { canonicalDataDir, ensurePrivateDir } from '../../src/server/storage/paths';

const dirs: string[] = [];
const handles: DatabaseHandle[] = [];

afterEach(() => {
  while (handles.length > 0) {
    try {
      handles.pop()?.close();
    } catch {
      // already closed by a restore swap
    }
  }
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

const NOW = '2028-04-15T10:00:00.000Z';

function makeRuntime(): { runtime: Runtime; dataDir: string } {
  const raw = mkdtempSync(join(tmpdir(), 'centurion-restore-'));
  dirs.push(raw);
  const dataDir = canonicalDataDir(raw);
  ensurePrivateDir(dataDir);
  const db = openDatabase(join(dataDir, 'centurion.sqlite'));
  handles.push(db);
  const runtime = new Runtime(
    loadConfig({}, { dataDir }),
    fixedClock(NOW),
    dataDir,
    new OperationGate(),
    db,
    randomUUID(),
  );
  return { runtime, dataDir };
}

function seedPlan(db: BetterSqlite3.Database, year = 2028): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO plans (id, year, name, perimeter, data_revision, created_at, updated_at)
     VALUES (?, ?, ?, '', 0, ?, ?)`,
  ).run(id, year, `Plan annuel ${year}`, NOW, NOW);
  return id;
}

function seedControl(db: BetterSqlite3.Database, planId: string, code: string): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO controls
       (id, plan_id, code, title, description, reference, domain, owner_name,
        method, expected_evidence, automated, automation_github_url, frequency_kind,
        anchor_date, explicit_dates_json, active_from, active_to, status, created_at, updated_at)
     VALUES (?, ?, ?, 'Titre', 'Description', 'REF', 'Domaine', '', '', '',
             0, NULL, 'annual', '2028-01-01', NULL, NULL, NULL, 'active', ?, ?)`,
  ).run(id, planId, code, NOW, NOW);
  return id;
}

function controlCount(db: BetterSqlite3.Database): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM controls').get() as { c: number }).c;
}

function bumpRevision(db: BetterSqlite3.Database, planId: string): void {
  db.prepare('UPDATE plans SET data_revision = data_revision + 1 WHERE id = ?').run(planId);
}

describe('backup catalog', () => {
  it('captures commits still in the WAL and verifies integrity', async () => {
    const { runtime, dataDir } = makeRuntime();
    const plan = seedPlan(runtime.db.db);
    seedControl(runtime.db.db, plan, 'C1');

    const dto = await createBackup(runtime, 'manual');
    expect(dto.schema_version).toBe(3);
    expect(dto.size_bytes).toBeGreaterThan(0);
    expect(dto.sha256).toBe(sha256File(backupSqlitePath(dataDir, dto.id)));

    const backup = openDatabase(backupSqlitePath(dataDir, dto.id));
    handles.push(backup);
    expect(controlCount(backup.db)).toBe(1);
  });

  it('refuses an unknown, altered or newer-schema source', async () => {
    const { runtime, dataDir } = makeRuntime();
    const plan = seedPlan(runtime.db.db);
    seedControl(runtime.db.db, plan, 'C1');
    const dto = await createBackup(runtime, 'manual');

    expect(() => createRestorePreview(runtime, randomUUID())).toThrow(/Backup not found/);

    writeFileSync(backupSqlitePath(dataDir, dto.id), 'corrupted');
    expect(() => createRestorePreview(runtime, dto.id)).toThrow(/failed verification/);

    const manifest = readManifest(dataDir, dto.id);
    if (!manifest) throw new Error('manifest missing');
    writeFileSync(
      backupManifestPath(dataDir, dto.id),
      JSON.stringify({ ...manifest, schema_version: 4 }),
    );
    expect(() => createRestorePreview(runtime, dto.id)).toThrow(/newer than current/);
  });

  it('aborts when the backup cannot be written', async () => {
    const { runtime, dataDir } = makeRuntime();
    seedPlan(runtime.db.db);
    // Occupy the backups path with a file so the directory cannot be created.
    writeFileSync(join(dataDir, 'backups'), 'not a directory');
    await expect(createBackup(runtime, 'manual')).rejects.toBeTruthy();
    expect(listManifests(dataDir)).toEqual([]);
  });
});

describe('restore', () => {
  it('reverts business data, keeps the pre_restore and renews the epoch', async () => {
    const { runtime, dataDir } = makeRuntime();
    const plan = seedPlan(runtime.db.db);
    seedControl(runtime.db.db, plan, 'C1');
    const backup = await createBackup(runtime, 'manual');

    seedControl(runtime.db.db, plan, 'C2');
    bumpRevision(runtime.db.db, plan);
    expect(controlCount(runtime.db.db)).toBe(2);

    const preview = createRestorePreview(runtime, backup.id);
    const before = runtime.engineEpoch;
    const result = await restoreBackup(runtime, preview.id);

    expect(result.restored).toBe(true);
    expect(result.engine_epoch).not.toBe(before);
    expect(runtime.engineEpoch).toBe(result.engine_epoch);
    handles.push(runtime.db);
    expect(controlCount(runtime.db.db)).toBe(1);
    expect(listManifests(dataDir).some((manifest) => manifest.reason === 'pre_restore')).toBe(true);

    const audit = runtime.db.db
      .prepare("SELECT COUNT(*) AS c FROM audit_events WHERE action = 'restore_completed'")
      .get() as { c: number };
    expect(audit.c).toBe(1);
  });

  it('refuses a stale preview after a realization changes the plan', async () => {
    const { runtime } = makeRuntime();
    const plan = seedPlan(runtime.db.db);
    seedControl(runtime.db.db, plan, 'C1');
    const backup = await createBackup(runtime, 'manual');
    const preview = createRestorePreview(runtime, backup.id);

    bumpRevision(runtime.db.db, plan);
    await expect(restoreBackup(runtime, preview.id)).rejects.toThrow(/changed since preview/);
  });

  it('refuses requests during a maintenance window with 503', async () => {
    const gate = new OperationGate();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const maintenance = gate.runMaintenance(async () => {
      await held;
      return 'done';
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gate.isMaintenance()).toBe(true);
    expect(() => gate.runRead(() => 'read')).toThrow(/Maintenance in progress/);
    release();
    await maintenance;
    expect(gate.runRead(() => 'read')).toBe('read');
  });
});

describe('crash recovery', () => {
  async function crashAt(phase: 'prepared' | 'old_moved' | 'new_installed' | 'committed') {
    const { runtime, dataDir } = makeRuntime();
    const plan = seedPlan(runtime.db.db);
    seedControl(runtime.db.db, plan, 'C1');
    const backup = await createBackup(runtime, 'manual');

    seedControl(runtime.db.db, plan, 'C2');
    bumpRevision(runtime.db.db, plan);
    const preview = createRestorePreview(runtime, backup.id);

    await expect(
      restoreBackup(runtime, preview.id, {
        onPhase: (current) => {
          if (current === phase) throw new Error('simulated_crash');
        },
      }),
    ).rejects.toThrow('simulated_crash');

    handles.push(runtime.db);
    return { dataDir, backupId: backup.id };
  }

  function reopen(dataDir: string): DatabaseHandle {
    const handle = openDatabase(join(dataDir, 'centurion.sqlite'));
    handles.push(handle);
    return handle;
  }

  it('keeps the original base when stopped before any rename', async () => {
    const { dataDir } = await crashAt('prepared');
    expect(recoverOnStartup(dataDir)).toEqual({ action: 'kept_original' });
    expect(recoverOnStartup(dataDir)).toEqual({ action: 'none' });
    const handle = reopen(dataDir);
    expect(handle.db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(controlCount(handle.db)).toBe(2);
  });

  it('rolls back after old_moved', async () => {
    const { dataDir } = await crashAt('old_moved');
    expect(recoverOnStartup(dataDir)).toEqual({ action: 'rolled_back' });
    expect(recoverOnStartup(dataDir)).toEqual({ action: 'none' });
    const handle = reopen(dataDir);
    expect(handle.db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(controlCount(handle.db)).toBe(2);
  });

  it('rolls back after new_installed', async () => {
    const { dataDir } = await crashAt('new_installed');
    expect(recoverOnStartup(dataDir)).toEqual({ action: 'rolled_back' });
    const handle = reopen(dataDir);
    expect(handle.db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(controlCount(handle.db)).toBe(2);
  });

  it('keeps the new base after committed', async () => {
    const { dataDir } = await crashAt('committed');
    expect(recoverOnStartup(dataDir)).toEqual({ action: 'kept_new' });
    const handle = reopen(dataDir);
    expect(handle.db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(controlCount(handle.db)).toBe(1);
  });
});
