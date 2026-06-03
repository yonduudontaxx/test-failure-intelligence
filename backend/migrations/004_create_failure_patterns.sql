-- Up Migration

CREATE TABLE failure_patterns (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  pattern          TEXT        NOT NULL,
  category         TEXT,
  severity         TEXT        NOT NULL DEFAULT 'LOW'
                                         CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  occurrence_count INTEGER     NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  first_seen_at    TIMESTAMPTZ NOT NULL,
  last_seen_at     TIMESTAMPTZ NOT NULL CHECK (last_seen_at >= first_seen_at),
  CONSTRAINT failure_patterns_project_id_pattern_key UNIQUE (project_id, pattern)
);

-- Down Migration

DROP TABLE failure_patterns;
