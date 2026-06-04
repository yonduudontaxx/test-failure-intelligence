-- Up Migration

ALTER TABLE test_runs ADD COLUMN external_id TEXT;

-- Down Migration

ALTER TABLE test_runs DROP COLUMN external_id;
