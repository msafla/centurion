import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  canonicalDataDir,
  ensurePrivateDir,
  isUuid,
  resolveManagedFile,
} from '../../src/server/storage/paths';

const dirs: string[] = [];
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'centurion-paths-'));
  dirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const UUID = '123e4567-e89b-42d3-a456-426614174000';

describe('managed paths', () => {
  it('creates a canonical data directory', () => {
    const base = temp();
    const dir = canonicalDataDir(join(base, 'instance'));
    expect(existsSync(dir)).toBe(true);
    expect(dir.endsWith('instance')).toBe(true);
  });

  it('validates UUIDs', () => {
    expect(isUuid(UUID)).toBe(true);
    expect(isUuid('../../etc/passwd')).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
  });

  it('resolves a managed file strictly under its kind directory', () => {
    const dataDir = canonicalDataDir(join(temp(), 'data'));
    const path = resolveManagedFile(dataDir, 'backup', UUID, '.sqlite');
    expect(path).toBe(join(dataDir, 'backups', `${UUID}.sqlite`));
    expect(() => resolveManagedFile(dataDir, 'backup', '../evil', '.sqlite')).toThrow(
      'invalid_managed_id',
    );
    expect(() => resolveManagedFile(dataDir, 'backup', UUID, '.sqlite/../../x')).toThrow(
      'invalid_managed_extension',
    );
  });

  it('creates private directories on POSIX', () => {
    const dir = join(temp(), 'private');
    ensurePrivateDir(dir);
    expect(existsSync(dir)).toBe(true);
    if (process.platform !== 'win32') {
      expect(statSync(dir).mode & 0o777).toBe(0o700);
    }
  });
});
