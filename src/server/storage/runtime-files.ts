import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type BackendInfo = {
  origin: string;
  epoch: string;
  mcp_write_enabled: boolean;
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

/** Writes the private MCP token and the adapter bootstrap file atomically. */
export function writeRuntimeFiles(dataDir: string, info: BackendInfo): string {
  const dir = runtimeDir(dataDir);
  mkdirSync(dir, { recursive: true });
  if (process.platform !== 'win32') chmodSync(dir, 0o700);

  const token = randomBytes(32).toString('hex');
  writeFileSync(tokenPath(dataDir), token, { mode: 0o600 });

  const target = backendInfoPath(dataDir);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(info), { mode: 0o600 });
  renameSync(tmp, target);
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
