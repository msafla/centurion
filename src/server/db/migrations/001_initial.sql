-- CENTURION initial schema (user_version = 1)
-- STRICT tables, FK RESTRICT, append-only audit. Calendar validity is enforced
-- by the backend; SQLite enforces shape, closed enums and referential integrity.

CREATE TABLE plans (
  id            TEXT PRIMARY KEY,
  year          INTEGER NOT NULL UNIQUE CHECK (year BETWEEN 2000 AND 2100),
  name          TEXT NOT NULL,
  perimeter     TEXT NOT NULL DEFAULT '',
  data_revision INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
) STRICT;

CREATE TABLE controls (
  id                    TEXT PRIMARY KEY,
  plan_id               TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  code                  TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL,
  reference             TEXT NOT NULL,
  domain                TEXT NOT NULL,
  owner_name            TEXT NOT NULL DEFAULT '',
  method                TEXT NOT NULL DEFAULT '',
  expected_evidence     TEXT NOT NULL DEFAULT '',
  automated             INTEGER NOT NULL CHECK (automated IN (0,1)),
  automation_github_url TEXT,
  frequency_kind        TEXT NOT NULL CHECK (frequency_kind IN ('once','monthly','quarterly','semiannual','annual','explicit')),
  anchor_date           TEXT,
  explicit_dates_json   TEXT,
  active_from           TEXT,
  active_to             TEXT,
  status                TEXT NOT NULL CHECK (status IN ('active','archived')),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  UNIQUE (plan_id, code),
  CHECK (automated = 1 OR automation_github_url IS NULL),
  CHECK ((frequency_kind = 'explicit') = (anchor_date IS NULL)),
  CHECK ((frequency_kind = 'explicit') = (explicit_dates_json IS NOT NULL)),
  CHECK (active_from IS NULL OR active_to IS NULL OR active_from <= active_to)
) STRICT;

CREATE INDEX controls_plan_status_code ON controls(plan_id, status, code);

-- Dynamic referential catalog and many-to-many links. A control can belong to
-- several referentials, so combined referentials are native.
CREATE TABLE referentials (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE control_referentials (
  control_id     TEXT NOT NULL REFERENCES controls(id) ON DELETE RESTRICT,
  referential_id TEXT NOT NULL REFERENCES referentials(id) ON DELETE RESTRICT,
  created_at     TEXT NOT NULL,
  PRIMARY KEY (control_id, referential_id)
) STRICT;

CREATE INDEX control_referentials_referential ON control_referentials(referential_id, control_id);

INSERT INTO referentials (id, slug, label, created_at, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000001', 'iso_27001', 'ISO 27001', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('00000000-0000-4000-8000-000000000002', 'isae_3402_t2', 'ISAE 3402 Type 2', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('00000000-0000-4000-8000-000000000003', 'pci_dss', 'PCI DSS', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('00000000-0000-4000-8000-000000000004', 'soc_2', 'SOC 2', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

CREATE TABLE occurrences (
  id              TEXT PRIMARY KEY,
  control_id      TEXT NOT NULL REFERENCES controls(id) ON DELETE RESTRICT,
  occurrence_date TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('open','completed','superseded')),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX occurrences_active_unique
  ON occurrences(control_id, occurrence_date)
  WHERE state IN ('open','completed');

CREATE INDEX occurrences_control_state_date ON occurrences(control_id, state, occurrence_date);

CREATE TABLE realizations (
  id             TEXT PRIMARY KEY,
  occurrence_id  TEXT NOT NULL UNIQUE REFERENCES occurrences(id) ON DELETE RESTRICT,
  completed_date TEXT NOT NULL,
  fait           INTEGER NOT NULL CHECK (fait IN (0,1)),
  conformite     TEXT NOT NULL CHECK (conformite IN ('conforme','partiellement_conforme','non_conforme','non_applicable')),
  comment        TEXT NOT NULL DEFAULT '',
  evidence_ref   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  CHECK (fait = 1 OR (conformite = 'non_applicable' AND evidence_ref IS NULL))
) STRICT;

CREATE TABLE schedule_previews (
  id                      TEXT PRIMARY KEY,
  plan_id                 TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  control_id              TEXT NOT NULL REFERENCES controls(id) ON DELETE RESTRICT,
  base_plan_revision      INTEGER NOT NULL,
  engine_epoch            TEXT NOT NULL,
  requested_schedule_json TEXT NOT NULL,
  delta_json              TEXT NOT NULL,
  expires_at              TEXT NOT NULL,
  consumed_at             TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
) STRICT;

CREATE INDEX schedule_previews_expires ON schedule_previews(expires_at);

CREATE TABLE import_runs (
  id                     TEXT PRIMARY KEY,
  plan_id                TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  stored_file_id         TEXT NOT NULL,
  original_filename      TEXT NOT NULL,
  source_hash_sha256     TEXT NOT NULL,
  mapping_json           TEXT,
  normalized_preview_json TEXT,
  base_plan_revision     INTEGER,
  engine_epoch           TEXT NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN ('uploaded','preview','applied','cancelled','expired')),
  expires_at             TEXT NOT NULL,
  applied_at             TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
) STRICT;

CREATE INDEX import_runs_expires ON import_runs(expires_at);

CREATE TABLE restore_previews (
  id                      TEXT PRIMARY KEY,
  backup_id               TEXT NOT NULL,
  base_global_revisions_json TEXT NOT NULL,
  source_hash_sha256      TEXT NOT NULL,
  engine_epoch            TEXT NOT NULL,
  expires_at              TEXT NOT NULL,
  consumed_at             TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
) STRICT;

CREATE INDEX restore_previews_expires ON restore_previews(expires_at);

CREATE TABLE mcp_proposals (
  id                       TEXT PRIMARY KEY,
  plan_id                  TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  tool                     TEXT NOT NULL CHECK (tool IN ('create_control','update_control_metadata','set_occurrence')),
  normalized_arguments_json TEXT NOT NULL,
  diff_json                TEXT NOT NULL,
  base_plan_revision       INTEGER NOT NULL,
  arguments_hash           TEXT NOT NULL,
  engine_epoch             TEXT NOT NULL,
  state                    TEXT NOT NULL CHECK (state IN ('pending','applied','rejected','expired')),
  expires_at               TEXT NOT NULL,
  result_json              TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
) STRICT;

CREATE INDEX mcp_proposals_expires ON mcp_proposals(expires_at);

CREATE TABLE audit_events (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  plan_id     TEXT REFERENCES plans(id) ON DELETE RESTRICT,
  control_id  TEXT REFERENCES controls(id) ON DELETE RESTRICT,
  action      TEXT NOT NULL,
  at_utc      TEXT NOT NULL,
  before_json TEXT,
  after_json  TEXT,
  source      TEXT NOT NULL CHECK (source IN ('api','mcp','import','system')),
  created_at  TEXT NOT NULL
) STRICT;

CREATE INDEX audit_events_scope ON audit_events(plan_id, control_id, at_utc, id);

-- Append-only audit.
CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_append_only');
END;

CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_append_only');
END;

-- No deletion of plans, controls, occurrences or realizations.
CREATE TRIGGER plans_no_delete BEFORE DELETE ON plans
BEGIN SELECT RAISE(ABORT, 'plan_delete_forbidden'); END;

CREATE TRIGGER controls_no_delete BEFORE DELETE ON controls
BEGIN SELECT RAISE(ABORT, 'control_delete_forbidden'); END;

CREATE TRIGGER occurrences_no_delete BEFORE DELETE ON occurrences
BEGIN SELECT RAISE(ABORT, 'occurrence_delete_forbidden'); END;

CREATE TRIGGER realizations_no_delete BEFORE DELETE ON realizations
BEGIN SELECT RAISE(ABORT, 'realization_delete_forbidden'); END;

-- A realization may only be created for an open or completed occurrence.
CREATE TRIGGER realizations_before_insert
BEFORE INSERT ON realizations
BEGIN
  SELECT CASE
    WHEN (SELECT state FROM occurrences WHERE id = NEW.occurrence_id) NOT IN ('open','completed')
    THEN RAISE(ABORT, 'realization_requires_open_or_completed')
  END;
END;

-- Creating a realization marks its occurrence completed.
CREATE TRIGGER realizations_after_insert
AFTER INSERT ON realizations
BEGIN
  UPDATE occurrences
     SET state = 'completed', updated_at = NEW.updated_at
   WHERE id = NEW.occurrence_id;
END;

-- A completed occurrence cannot leave completed while a realization exists,
-- and cannot become completed without one (only the sync trigger above may).
CREATE TRIGGER occurrences_before_update
BEFORE UPDATE ON occurrences
BEGIN
  SELECT CASE
    WHEN OLD.state = 'completed' AND NEW.state <> 'completed'
         AND EXISTS (SELECT 1 FROM realizations WHERE occurrence_id = OLD.id)
    THEN RAISE(ABORT, 'occurrence_has_realization')
  END;
  SELECT CASE
    WHEN NEW.state = 'completed' AND OLD.state <> 'completed'
         AND NOT EXISTS (SELECT 1 FROM realizations WHERE occurrence_id = NEW.id)
    THEN RAISE(ABORT, 'occurrence_completed_without_realization')
  END;
END;
