import type BetterSqlite3 from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export type EvidenceDto = {
  id: string;
  occurrence_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
};

export function listEvidence(db: BetterSqlite3.Database, occurrenceId: string): EvidenceDto[] {
  return db
    .prepare(
      `SELECT id, occurrence_id, original_name, mime_type, size_bytes, sha256, created_at
       FROM occurrence_evidence
       WHERE occurrence_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .all(occurrenceId) as EvidenceDto[];
}

export type EvidenceRecord = EvidenceDto & { stored_name: string };

export function getEvidence(db: BetterSqlite3.Database, evidenceId: string): EvidenceRecord | undefined {
  return db
    .prepare(
      `SELECT id, occurrence_id, original_name, stored_name, mime_type, size_bytes, sha256, created_at
       FROM occurrence_evidence
       WHERE id = ?`,
    )
    .get(evidenceId) as EvidenceRecord | undefined;
}

export function deleteEvidence(db: BetterSqlite3.Database, evidenceId: string): void {
  db.prepare('DELETE FROM occurrence_evidence WHERE id = ?').run(evidenceId);
}

export function insertEvidence(
  db: BetterSqlite3.Database,
  input: {
    occurrenceId: string;
    originalName: string;
    storedName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    nowUtc: string;
  },
): EvidenceDto {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO occurrence_evidence (id, occurrence_id, original_name, stored_name, mime_type, size_bytes, sha256, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.occurrenceId,
    input.originalName,
    input.storedName,
    input.mimeType,
    input.sizeBytes,
    input.sha256,
    input.nowUtc,
  );
  return {
    id,
    occurrence_id: input.occurrenceId,
    original_name: input.originalName,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    sha256: input.sha256,
    created_at: input.nowUtc,
  };
}
