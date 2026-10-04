import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpPolicy } from '../mcp/policy-store';

export type BackendInfo = {
  origin: string;
  epoch: string;
  policy: McpPolicy;
};

export function runtimeDir(dataDir: string): string {
  return join(dataDir, 'runtime');
}

export function tokenPath(dataDir: string): string {
  return join(runtimeDir(dataDir), 'mcp-token');
}

export function backendInfoPath(dataDir: string): string {
  return join(runtimeDir(dataDir), 'backend.json');
}

/** Writes the adapter bootstrap file atomically (without touching the token). */
export function writeBackendInfo(dataDir: string, info: BackendInfo): void {
  const dir = runtimeDir(dataDir);
  mkdirSync(dir, { recursive: true });
  if (process.platform !== 'win32') chmodSync(dir, 0o700);

  const target = backendInfoPath(dataDir);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(info), { mode: 0o600 });
  renameSync(tmp, target);
}

/** Writes the private MCP token and the adapter bootstrap file atomically. */
export function writeRuntimeFiles(dataDir: string, info: BackendInfo): string {
  const dir = runtimeDir(dataDir);
  mkdirSync(dir, { recursive: true });
  if (process.platform !== 'win32') chmodSync(dir, 0o700);

  const token = randomBytes(32).toString('hex');
  writeFileSync(tokenPath(dataDir), token, { mode: 0o600 });
  writeBackendInfo(dataDir, info);
  return token;
}

export function readToken(dataDir: string): string | null {
  try {
    return readFileSync(tokenPath(dataDir), 'utf8').trim();
  } catch {
    return null;
  }
}

export function readBackendInfo(dataDir: string): BackendInfo | null {
  try {
    return JSON.parse(readFileSync(backendInfoPath(dataDir), 'utf8')) as BackendInfo;
  } catch {
    return null;
  }
}
