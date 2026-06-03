-- Up Migration

-- projects: add slug column (URL-safe identifier per spec §4)
-- Backfill any existing rows from id::TEXT before applying NOT NULL + UNIQUE.

ALTER TABLE projects
  ADD COLUMN slug TEXT;

UPDATE projects
  SET slug = id::TEXT
  WHERE slug IS NULL;

ALTER TABLE projects
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE projects
  ADD CONSTRAINT projects_slug_key UNIQUE (slug);

-- test_runs: add filtering indexes for branch and environment

CREATE INDEX test_runs_project_id_branch_idx
  ON test_runs (project_id, branch);

CREATE INDEX test_runs_project_id_environment_idx
  ON test_runs (project_id, environment);

-- test_case_results: add status filtering index

CREATE INDEX test_case_results_project_id_status_idx
  ON test_case_results (project_id, status);

-- failure_patterns: add severity filtering index

CREATE INDEX failure_patterns_project_id_severity_idx
  ON failure_patterns (project_id, severity);

-- Down Migration

DROP INDEX failure_patterns_project_id_severity_idx;
DROP INDEX test_case_results_project_id_status_idx;
DROP INDEX test_runs_project_id_environment_idx;
DROP INDEX test_runs_project_id_branch_idx;

ALTER TABLE projects
  DROP CONSTRAINT projects_slug_key;

ALTER TABLE projects
  DROP COLUMN slug;
