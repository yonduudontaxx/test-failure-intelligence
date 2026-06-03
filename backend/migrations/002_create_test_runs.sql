-- Up Migration

CREATE TABLE test_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  status        TEXT        NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'PARTIAL')),
  source_type   TEXT        NOT NULL CHECK (source_type IN ('api', 'junit_xml', 'playwright', 'jest', 'json')),
  environment   TEXT,
  branch        TEXT,
  commit_sha    TEXT,
  pipeline_name TEXT,
  build_number  TEXT,
  total_tests   INTEGER     NOT NULL DEFAULT 0 CHECK (total_tests >= 0),
  passed_tests  INTEGER     NOT NULL DEFAULT 0 CHECK (passed_tests >= 0),
  failed_tests  INTEGER     NOT NULL DEFAULT 0 CHECK (failed_tests >= 0),
  skipped_tests INTEGER     NOT NULL DEFAULT 0 CHECK (skipped_tests >= 0),
  duration_ms   INTEGER     CHECK (duration_ms >= 0),
  metadata      JSONB,
  executed_at   TIMESTAMPTZ,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX test_runs_project_id_executed_at_idx
  ON test_runs (project_id, executed_at DESC NULLS LAST);

-- Down Migration

DROP INDEX test_runs_project_id_executed_at_idx;
DROP TABLE test_runs;
