CREATE TABLE occurrence_evidence (
  id              TEXT PRIMARY KEY,
  occurrence_id   TEXT NOT NULL REFERENCES occurrences(id) ON DELETE RESTRICT,
  original_name   TEXT NOT NULL,
  stored_name     TEXT NOT NULL UNIQUE,
  mime_type       TEXT NOT NULL CHECK (mime_type IN ('application/pdf','image/png','image/jpeg','text/plain')),
  size_bytes      INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  sha256          TEXT NOT NULL,
  created_at      TEXT NOT NULL
) STRICT;

CREATE INDEX occurrence_evidence_occurrence ON occurrence_evidence(occurrence_id, created_at);
