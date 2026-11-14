import { createHash, randomUUID } from 'node:crypto';
import { rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { AppError } from '../http/errors';
import type { Runtime } from '../runtime';
import { ensurePrivateDir } from '../storage/paths';
import { detectSeparator, parseCsv } from './parse-csv';
import { inspectXlsx } from './parse-xlsx';
import { preflightZip } from './zip-preflight';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_TEMP_FILES = 3;
const MAX_TEMP_BYTES = 15 * 1024 * 1024;
const TTL_MS = 30 * 60 * 1000;

export type UploadResponse = {
  import_id: string;
  expires_at: string;
  sheets: string[] | null;
  headers: string[];
  sample_rows: string[][];
  separator: ',' | ';' | null;
};

export function importsDir(dataDir: string): string {
  return join(dataDir, 'imports');
}

export function importFilePath(dataDir: string, importId: string): string {
  return join(importsDir(dataDir), `${importId}.upload`);
}

function enforceQuota(db: BetterSqlite3.Database, dataDir: string, nowIso: string): void {
  const rows = db
    .prepare(
      `SELECT stored_file_id FROM import_runs
        WHERE status IN ('uploaded','preview') AND expires_at > ?`,
    )
    .all(nowIso) as { stored_file_id: string }[];
  if (rows.length >= MAX_TEMP_FILES) {
    throw new AppError(429, 'import_quota_exceeded', 'Too many temporary imports');
  }
  let total = 0;
  for (const row of rows) {
    try {
      total += statSync(importFilePath(dataDir, row.stored_file_id)).size;
    } catch {
      // ignore missing temp file
    }
  }
  if (total >= MAX_TEMP_BYTES) {
    throw new AppError(429, 'import_quota_exceeded', 'Temporary import storage full');
  }
}

export async function storeUpload(
  runtime: Runtime,
  planId: string,
  filename: string,
  buffer: Buffer,
): Promise<UploadResponse> {
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new AppError(413, 'payload_too_large', 'Upload exceeds 5 MiB');
  }
  const lower = filename.toLowerCase();
  const isCsv = lower.endsWith('.csv');
  const isXlsx = lower.endsWith('.xlsx');
  if (!isCsv && !isXlsx) {
    throw new AppError(415, 'unsupported_file_type', 'Only .csv and .xlsx are accepted');
  }

  const db = runtime.db.db;
  const now = runtime.clock.nowUtc();
  enforceQuota(db, runtime.dataDir, now);

  const id = randomUUID();
  ensurePrivateDir(importsDir(runtime.dataDir));
  const path = importFilePath(runtime.dataDir, id);
  writeFileSync(path, buffer, { mode: 0o600 });
  const sourceHash = createHash('sha256').update(buffer).digest('hex');

  let sheets: string[] | null = null;
  let headers: string[] = [];
  let sample: string[][] = [];
  let separator: ',' | ';' | null = null;

  try {
    if (isCsv) {
      const text = buffer.toString('utf8');
      separator = detectSeparator(text);
      if (!separator) throw new AppError(422, 'csv_separator_ambiguous', 'Separator ambiguous');
      const rows = parseCsv(text, separator);
      headers = rows[0] ?? [];
      sample = rows.slice(1, 6);
    } else {
      await preflightZip(buffer);
      const inspection = await inspectXlsx(buffer);
      sheets = inspection.sheetNames;
      headers = inspection.headers;
      sample = inspection.sample;
    }
  } catch (error) {
    rmSync(path, { force: true });
    if (error instanceof AppError) throw error;
    throw new AppError(422, 'invalid_import_file', 'Import file rejected');
  }

  const expiresAt = new Date(Date.parse(now) + TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO import_runs
       (id, plan_id, stored_file_id, original_filename, source_hash_sha256, mapping_json,
        normalized_preview_json, base_plan_revision, engine_epoch, status, expires_at, applied_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 'uploaded', ?, NULL, ?, ?)`,
  ).run(id, planId, id, filename, sourceHash, runtime.engineEpoch, expiresAt, now, now);

  return { import_id: id, expires_at: expiresAt, sheets, headers, sample_rows: sample, separator };
}

export function cleanupExpiredImports(db: BetterSqlite3.Database, dataDir: string, nowIso: string): void {
  const rows = db
    .prepare(
      `SELECT id, stored_file_id FROM import_runs
        WHERE status IN ('uploaded','preview','expired') AND expires_at <= ?`,
    )
    .all(nowIso) as { id: string; stored_file_id: string }[];
  for (const row of rows) {
    rmSync(importFilePath(dataDir, row.stored_file_id), { force: true });
    db.prepare("UPDATE import_runs SET status = 'expired', updated_at = ? WHERE id = ?").run(
      nowIso,
      row.id,
    );
  }
}
