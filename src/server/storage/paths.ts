import { chmodSync, mkdirSync, realpathSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';

export const MANAGED_KINDS = ['backup', 'import', 'export', 'restore'] as const;
export type ManagedKind = (typeof MANAGED_KINDS)[number];

const MANAGED_DIRS: Record<ManagedKind, string> = {
  backup: 'backups',
  import: 'imports',
  export: 'exports',
  restore: 'restores',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Resolves the data directory to an absolute canonical path and creates it.
 * The caller must verify it is not a symlink/reparse component in managed
 * subfolders before writing sensitive files.
 */
export function canonicalDataDir(raw: string): string {
  const absolute = resolve(raw);
  mkdirSync(absolute, { recursive: true });
  return realpathSync(absolute);
}

export function ensurePrivateDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  if (process.platform !== 'win32') {
    chmodSync(dir, 0o700);
  }
}

export function managedDir(dataDir: string, kind: ManagedKind): string {
  return join(dataDir, MANAGED_DIRS[kind]);
}

/**
 * Builds a managed file path from a server-owned identifier. Rejects any
 * identifier that is not a UUID, so a client can never supply a path.
 */
export function resolveManagedFile(
  dataDir: string,
  kind: ManagedKind,
  id: string,
  extension: string,
): string {
  if (!isUuid(id)) throw new Error('invalid_managed_id');
  if (!/^\.[a-z0-9]+$/i.test(extension)) throw new Error('invalid_managed_extension');
  const dir = managedDir(dataDir, kind);
  const candidate = normalize(join(dir, `${id}${extension}`));
  if (!candidate.startsWith(dir + sep)) throw new Error('managed_path_escape');
  return candidate;
}
