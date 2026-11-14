import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { verifySqliteFile } from './catalog';

export type RestorePhase = 'prepared' | 'old_moved' | 'new_installed' | 'committed';

export type RestoreJournal = {
  phase: RestorePhase;
  candidate_id: string;
  previous_id: string;
  candidate_path: string;
  previous_path: string;
  main_path: string;
  candidate_hash: string;
  previous_hash: string;
  engine_epoch?: string;
  updated_at: string;
};

export function journalPath(dataDir: string): string {
  return join(dataDir, 'restore-journal.json');
}

export function writeJournal(dataDir: string, journal: RestoreJournal): void {
  const target = journalPath(dataDir);
  const tmp = `${target}.tmp`;
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeSync(fd, JSON.stringify(journal));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, target);
}

export function readJournal(dataDir: string): RestoreJournal | null {
  const path = journalPath(dataDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RestoreJournal;
  } catch {
    return null;
  }
}

export function removeJournal(dataDir: string): void {
  rmSync(journalPath(dataDir), { force: true });
}

function removeSidecars(path: string): void {
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}

export type RecoveryResult = { action: 'none' | 'kept_original' | 'kept_new' | 'rolled_back' };

/**
 * Deterministic startup recovery. A non-committed journal rolls back to the
 * previous file when a rename already happened; a committed journal keeps the
 * new verified base. Unknown states refuse to guess and throw.
 */
export function recoverOnStartup(dataDir: string): RecoveryResult {
  const journal = readJournal(dataDir);
  if (!journal) return { action: 'none' };

  if (journal.phase === 'committed') {
    verifySqliteFile(journal.main_path);
    removeSidecars(journal.previous_path);
    rmSync(journal.previous_path, { force: true });
    removeJournal(dataDir);
    return { action: 'kept_new' };
  }

  if (journal.phase === 'prepared') {
    removeSidecars(journal.candidate_path);
    rmSync(journal.candidate_path, { force: true });
    removeJournal(dataDir);
    return { action: 'kept_original' };
  }

  if (journal.phase !== 'old_moved' && journal.phase !== 'new_installed') {
    throw new Error('recovery_unknown_phase');
  }

  if (!existsSync(journal.previous_path)) throw new Error('recovery_previous_missing');

  removeSidecars(journal.candidate_path);
  rmSync(journal.candidate_path, { force: true });
  removeSidecars(journal.main_path);
  rmSync(journal.main_path, { force: true });
  renameSync(journal.previous_path, journal.main_path);
  removeJournal(dataDir);
  return { action: 'rolled_back' };
}
