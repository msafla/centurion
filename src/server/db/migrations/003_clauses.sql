CREATE TABLE clauses (
  id            TEXT PRIMARY KEY,
  referential_id TEXT REFERENCES referentials(id) ON DELETE RESTRICT,
  code          TEXT NOT NULL,
  title         TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(referential_id, code)
) STRICT;

CREATE TABLE control_clauses (
  control_id TEXT NOT NULL REFERENCES controls(id) ON DELETE RESTRICT,
  clause_id  TEXT NOT NULL REFERENCES clauses(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (control_id, clause_id)
) STRICT;

CREATE INDEX control_clauses_clause ON control_clauses(clause_id, control_id);
