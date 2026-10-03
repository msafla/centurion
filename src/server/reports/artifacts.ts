import { randomUUID } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { AppError } from '../http/errors';
import type { Runtime } from '../runtime';
import { ensurePrivateDir } from '../storage/paths';

const MAX_ARTIFACTS = 20;
const MAX_BYTES = 128 * 1024 * 1024;
const TTL_MS = 24 * 60 * 60 * 1000;

export type ArtifactDto = {
  export_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  expires_at: string;
};

export type ArtifactManifest = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  expires_at: string;
  extension: string;
};

export function exportsDir(dataDir: string): string {
  return join(dataDir, 'exports');
}

function manifestPath(dataDir: string, id: string): string {
  return join(exportsDir(dataDir), `${id}.json`);
}

function artifactPath(dataDir: string, id: string, extension: string): string {
  return join(exportsDir(dataDir), `${id}${extension}`);
}

function readManifest(dataDir: string, id: string): ArtifactManifest | null {
  const path = manifestPath(dataDir, id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ArtifactManifest;
  } catch {
    return null;
  }
}

export function listArtifacts(dataDir: string, nowIso: string): ArtifactManifest[] {
  const dir = exportsDir(dataDir);
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
    .filter((manifest): manifest is ArtifactManifest => manifest !== null)
    .filter((manifest) => manifest.expires_at > nowIso)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Reserves quota, then writes the artifact and its manifest atomically. */
export function reserveArtifact(
  runtime: Runtime,
  filename: string,
  mimeType: string,
  bytes: Uint8Array,
  extension: string,
): ArtifactDto {
  ensurePrivateDir(exportsDir(runtime.dataDir));
  const now = runtime.clock.nowUtc();
  const existing = listArtifacts(runtime.dataDir, now);
  if (existing.length >= MAX_ARTIFACTS) {
    throw new AppError(429, 'artifact_quota_exceeded', 'Too many artifacts');
  }
  const total = existing.reduce((sum, manifest) => sum + manifest.size_bytes, 0);
  if (total + bytes.byteLength > MAX_BYTES) {
    throw new AppError(429, 'artifact_quota_exceeded', 'Artifact storage full');
  }

  const id = randomUUID();
  const expiresAt = new Date(Date.parse(now) + TTL_MS).toISOString();
  writeFileSync(artifactPath(runtime.dataDir, id, extension), bytes, { mode: 0o600 });
  const manifest: ArtifactManifest = {
    id,
    filename,
    mime_type: mimeType,
    size_bytes: bytes.byteLength,
    created_at: now,
    expires_at: expiresAt,
    extension,
  };
  const target = manifestPath(runtime.dataDir, id);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest), { mode: 0o600 });
  renameSync(tmp, target);

  return {
    export_id: id,
    filename,
    mime_type: mimeType,
    size_bytes: bytes.byteLength,
    expires_at: expiresAt,
  };
}

export function getArtifact(
  dataDir: string,
  id: string,
  nowIso: string,
): { manifest: ArtifactManifest; path: string } {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError(404, 'not_found', 'Artifact not found');
  const manifest = readManifest(dataDir, id);
  if (!manifest || manifest.expires_at <= nowIso) {
    throw new AppError(404, 'not_found', 'Artifact not found');
  }
  const path = artifactPath(dataDir, id, manifest.extension);
  if (!existsSync(path)) throw new AppError(404, 'not_found', 'Artifact not found');
  return { manifest, path };
}

export function cleanupExpiredArtifacts(dataDir: string, nowIso: string): void {
  const dir = exportsDir(dataDir);
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const id = file.slice(0, -'.json'.length);
    const manifest = readManifest(dataDir, id);
    if (!manifest || manifest.expires_at <= nowIso) {
      rmSync(manifestPath(dataDir, id), { force: true });
      rmSync(artifactPath(dataDir, id, manifest?.extension ?? '.bin'), { force: true });
    }
  }
}
