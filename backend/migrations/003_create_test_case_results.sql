-- Up Migration

CREATE TABLE test_case_results (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  test_run_id     UUID        NOT NULL REFERENCES test_runs(id) ON DELETE RESTRICT,
  full_name       TEXT        NOT NULL,
  suite_name      TEXT,
  test_name       TEXT        NOT NULL,
  status          TEXT        NOT NULL CHECK (status IN ('PASSED', 'FAILED', 'SKIPPED', 'ERROR')),
  duration_ms     INTEGER     CHECK (duration_ms >= 0),
  failure_message TEXT,
  failure_type    TEXT,
  retry_count     INTEGER     NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  metadata        JSONB
);

CREATE INDEX test_case_results_test_run_id_idx
  ON test_case_results (test_run_id);

CREATE INDEX test_case_results_project_id_full_name_idx
  ON test_case_results (project_id, full_name);

-- Down Migration

DROP INDEX test_case_results_project_id_full_name_idx;
DROP INDEX test_case_results_test_run_id_idx;
DROP TABLE test_case_results;
